#\!/bin/bash

# Order data from the JSON file
PROTOCOL="0x1c1A74b677A28ff92f4AbF874b3Aa6dE864D3f06"
BOB_KEY="${BOB_PRIVATE_KEY}"

# Order struct
SALT="2693628279084505461360401121048259397408302180648511855826992122"
MAKER="0x240E2588e35FB9D3D60B283B45108a49972FFFd8"
RECEIVER="0x240E2588e35FB9D3D60B283B45108a49972FFFd8"
MAKER_ASSET="0x8287CD2aC7E227D9D927F998EB600a0683a832A1"
TAKER_ASSET="0x8287CD2aC7E227D9D927F998EB600a0683a832A1"
MAKING_AMOUNT="10000000000000000"
TAKING_AMOUNT="10000000000000000"
MAKER_TRAITS="33471150795161712739625987854991613538670879169864980536412174450159433809920"

# Signature (r,vs format)
SIGNATURE="0xe5cc9f1bf13d2d29856fec817c64d3d4aa466ad9e8b65c05b31c92a6e5eca17359e7f9587ee4939fb80a6568fb6ca2a2731e1a80476be2a3554b2ecbf8433a5d1c"
R="0xe5cc9f1bf13d2d29856fec817c64d3d4aa466ad9e8b65c05b31c92a6e5eca173"

# Extract v and s from signature
V_HEX="${SIGNATURE:130:2}"
S_HEX="${SIGNATURE:66:64}"

# Convert to vs format: vs = (v - 27) << 255 | s
# Since bash can't handle such large numbers, we'll use Python
VS=$(python3 -c "
sig = '$SIGNATURE'
v = int(sig[130:132], 16)
s = int(sig[66:130], 16)
vs = ((v - 27) << 255) | s
print(hex(vs)[2:].zfill(64))
")

# Fill amount
FILL_AMOUNT="$MAKING_AMOUNT"

# TakerTraits with maker-amount flag and extension length
# Extension is 212 bytes (0xd4 = 212)
# makerAmountFlag | (212 << 224) | threshold
TAKER_TRAITS=$(python3 -c "
makerAmountFlag = 1 << 255
extensionLen = 212
threshold = int('$TAKING_AMOUNT')
takerTraits = makerAmountFlag | (extensionLen << 224) | threshold
print(hex(takerTraits))
")

# Extension data
EXTENSION="0x000000b400000000000000000000000000000000000000000000000000000000B436dBBee1615dd80ff036Af81D8478c1FF1Eb689a5262b4378f2854eb738cfceb4322e3a779bb21fcf5afad8a9cdef787990093000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000008287cd2ac7e227d9d927f998eb600a0683a832a1000000000000000000005af3107a4000000000000000000000005af3107a4000000000000000000000000000689be59e000000000000000000000000689bd8ba"

echo "Filling order with cast..."
echo "Protocol: $PROTOCOL"
echo "R: $R"
echo "VS: 0x$VS"
echo "TakerTraits: $TAKER_TRAITS"
echo ""

# Build the call data
cast send \
  --private-key "$BOB_KEY" \
  --rpc-url "https://erpc.up.railway.app/main/evm/8453" \
  --gas-limit 2500000 \
  "$PROTOCOL" \
  "fillOrderArgs((uint256,address,address,address,address,uint256,uint256,uint256),bytes32,bytes32,uint256,uint256,bytes)" \
  "($SALT,$MAKER,$RECEIVER,$MAKER_ASSET,$TAKER_ASSET,$MAKING_AMOUNT,$TAKING_AMOUNT,$MAKER_TRAITS)" \
  "$R" \
  "0x$VS" \
  "$FILL_AMOUNT" \
  "$TAKER_TRAITS" \
  "$EXTENSION"
