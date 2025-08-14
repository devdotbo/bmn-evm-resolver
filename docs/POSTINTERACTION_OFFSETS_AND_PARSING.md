## 1inch Extension Offsets Header and PostInteraction Parsing (Verified)

This document corrects and clarifies how the 1inch-style extension offsets header and PostInteraction data must be encoded and parsed for our BMN flow. It is based on a deep read of our limit-order Solidity contracts and tests in `bmn-evm-contracts-limit-order` and reconciles our CLI/documentation assumptions.

### Executive summary

- The extension starts with a 32-byte offsets header, not a 4-byte header. There is no 28-byte “padding.”
- PostInteraction data (dynamic field index 7) begins immediately after that 32-byte header. For our flow, the first 20 bytes of the PostInteraction field are an address (factory/listener), followed by ABI-encoded payload.
- Our encoder approach (20-byte factory + ABI payload) is consistent with how `OrderMixin` consumes PostInteraction: the listener is the first 20 bytes, and the remainder is `data`.
- Parsing across CLIs must be unified: remove a full 32-byte header once, then read 20 bytes of factory, decode the rest.
- Keep addresses as `Address` in immutables (only amounts are `bigint`). Continue to store exact immutables at creation; treat “reconstruction” as diagnostic-only.
- No protocol-side contract change is needed.

---

## 1. Verified behavior in Solidity

### 1.1 Offsets header: 32 bytes of cumulative end offsets

The offsets header is a single 32-byte word encoding eight 32-bit “end” positions for dynamic fields 0..7. Begin for a field is the previous field’s end (or 0 for index 0). The library reads it as a 256-bit value and calculates begin/end per field.

```26:40:bmn-evm-contracts-limit-order/contracts/libraries/OffsetsLib.sol
function get(Offsets offsets, bytes calldata concat, uint256 index) internal pure returns(bytes calldata result) {
    // begin = end[i-1] (or 0 if i == 0), end = end[i]
}
```

`ExtensionLib` consumes the header by reading the first 32 bytes, then treats the remainder (`extension[0x20:]`) as the concatenated fields data:

```121:133:bmn-evm-contracts-limit-order/contracts/libraries/ExtensionLib.sol
function _get(bytes calldata extension, DynamicField field) private pure returns(bytes calldata) {
    if (extension.length < 0x20) return msg.data[:0];

    Offsets offsets;
    bytes calldata concat;
    assembly {
        offsets := calldataload(extension.offset)
        concat.offset := add(extension.offset, 0x20)
        concat.length := sub(extension.length, 0x20)
    }
    return offsets.get(concat, uint256(field));
}
```

Field indices follow `ExtensionLib.DynamicField`; PostInteraction is index 7.

### 1.2 PostInteraction layout and consumption

`OrderMixin` uses `extension.postInteractionTargetAndData()` and interprets the first 20 bytes as an address; the rest as data:

```427:438:bmn-evm-contracts-limit-order/contracts/OrderMixin.sol
// Post interaction, where maker can handle funds interactively
bytes calldata data = extension.postInteractionTargetAndData();
address listener = order.maker.get();
if (data.length > 19) {
    listener = address(bytes20(data));
    data = data[20:];
}
IPostInteraction(listener).postInteraction(
    order, extension, orderHash, msg.sender, makingAmount, takingAmount, remainingMakingAmount, data
);
```

This exactly matches our design to encode PostInteraction as:

- 20 bytes: target/listener address (the factory)
- Remaining bytes: ABI-encoded payload

### 1.3 Order hashing and extension validation

`OrderLib` enforces that when the maker flags `hasExtension`, the extension must be present and the low-160 bits of `keccak256(extension)` must equal the low-160 bits of `salt`:

```153:162:bmn-evm-contracts-limit-order/contracts/OrderLib.sol
function isValidExtension(IOrderMixin.Order calldata order, bytes calldata extension) internal pure returns(bool, bytes4) {
    if (order.makerTraits.hasExtension()) {
        if (extension.length == 0) return (false, MissingOrderExtension.selector);
        if (uint256(keccak256(extension)) & type(uint160).max != order.salt & type(uint160).max) return (false, InvalidExtensionHash.selector);
    } else {
        if (extension.length > 0) return (false, UnexpectedOrderExtension.selector);
    }
    return (true, 0x00000000);
}
```

This aligns with our CLI logic: if the maker declares an extension, we must pass the full extension bytes (header + fields) and ensure the salt’s low-160 matches.

---

## 2. Correct encoding and parsing model

### 2.1 Encoding the header for a single PostInteraction field

When we only include PostInteraction (field index 7):

- Concatenated data segment contains just PostInteraction bytes.
- Offsets header must set all ends[0..6] = 0 and ends[7] = length(PostInteraction).
- Full extension bytes = 32-byte header || PostInteraction segment.

This is compatible with `OffsetsLib.get()` and `ExtensionLib._get()`.

### 2.2 PostInteraction payload for BMN flow

We encode PostInteraction as:

- 20 bytes: factory address
- ABI-encoded payload: `(bytes32 hashlock, uint256 dstChainId, address dstToken, uint256 deposits, uint256 timelocks)`

This layout makes the factory the listener/target for `postInteraction`, and `extraData` is the ABI payload.

### 2.3 Parsing guidance (unify across CLIs)

The only safe, consistent parser for our usage:

1) Remove the first 32 bytes of the extension (the offsets header)
2) Read the next 20 bytes as the factory address
3) Treat the remainder as the ABI-encoded payload and decode `(bytes32, uint256, address, uint256, uint256)`

Do not remove 4 bytes or add/subtract 28 bytes of “padding”. The prior 4+28 heuristic was compensating for not removing the full 32-byte header once.

Pseudo-code (TypeScript):

```ts
function parsePostInteractionData(extension: Hex) {
  // 1) Strip the 32-byte offsets header
  const afterHeader = extension.slice(2 + 64);
  // 2) Read 20-byte factory
  const factory = ('0x' + afterHeader.slice(0, 40)) as Address;
  // 3) ABI-decode remainder
  const payload = ('0x' + afterHeader.slice(40)) as Hex;
  const [hashlock, dstChainId, dstToken, deposits, timelocks] = decodeAbiParameters(
    parseAbiParameters('bytes32, uint256, address, uint256, uint256'),
    payload,
  );
  return { factory, hashlock, dstChainId, dstToken, deposits, timelocks };
}
```

Optional: instead of manual slicing, keep the full extension bytes and use a Solidity-style decoder to read field 7 via the offsets (mirroring `ExtensionLib`), but the above is sufficient for our PoC.

---

## 3. TakerTraits, args lengths, and salts

Our CLI’s construction of `takerTraits` follows the spec in `TakerTraitsLib` (bit 255 makerAmount flag; bits 224–247 extension length; bits 200–223 interaction length; lower 185 bits threshold). It is valuable to keep the guard: `argsExtensionLength` must match the actual bytes length of the extension we pass.

```21:107:bmn-evm-contracts-limit-order/contracts/libraries/TakerTraitsLib.sol
// argsExtensionLength at bits 224-247; argsInteractionLength at bits 200-223
```

For salts, when maker declares an extension, the low 160 bits of the order salt must equal the low 160 bits of `keccak256(extension)` (see OrderLib excerpt above). Our CLI already sets this accordingly.

---

## 4. Immutables and timelocks

- Timelocks used by escrows are offsets relative to a `deployedAt` base timestamp. We must store the exact packed timelocks used when creating the destination escrow and provide those exact immutables at withdraw time.
- Any attempt to reconstruct `deployedAt` later will change the hash and result in `InvalidImmutables()`.
- The current approach—persisting the exact immutables during `createDstEscrow`/`swap-execute` and using them in `withdraw-dst`—is correct.

---

## 5. Validation aid: OffsetsInspector

Use `OffsetsInspector.inspect()` to sanity-check the encoded extension:

- `begin7` should be 0 when only PostInteraction is present.
- `end7` should equal the PostInteraction bytes length.
- The extracted `postData` should begin exactly at the 20-byte factory address boundary.

```17:51:bmn-evm-contracts-limit-order/contracts/helpers/OffsetsInspector.sol
function inspect(bytes calldata extension) external pure returns (
  uint32[8] memory ends, uint32 begin7, uint32 end7, address target, bytes memory postData
);
```

---

## 6. Action items for our codebase (no contract changes)

- Parsing: Replace all “4-byte header removal + 28-byte padding skip” logic with a single 32-byte header removal, then parse `factory` (20 bytes) + payload.
- Centralize parsing: Ensure every CLI uses the same parser implementation to avoid drift.
- Immutables typing: In any CLI path that builds imms tuples (e.g., `create-dst-escrow.ts`), keep `maker`, `receiver`, `token` typed as `Address`; only amounts/timelocks are `bigint`.
- Continue storing exact immutables at creation and using them during withdraw.

### Not required: protocol changes

No issues were found in the protocol contracts that would require changes:

- EIP-712 domain: `"Bridge-Me-Not Orders", version "1"` matches client usage.
- Maker/Taker traits, hashing, and extension validation are consistent with our flow.
- PostInteraction consumption matches our “20-byte listener + payload” encoding.

---

## 7. Appendix: Field indices for ExtensionLib.DynamicField

For reference, dynamic field indices are:

0. MakerAssetSuffix
1. TakerAssetSuffix
2. MakingAmountData
3. TakingAmountData
4. Predicate
5. MakerPermit
6. PreInteractionData
7. PostInteractionData

When only PostInteraction is used, the offsets header must have ends[0..6] = 0 and ends[7] = total bytes of PostInteraction.


