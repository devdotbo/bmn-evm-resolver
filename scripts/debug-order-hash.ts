import { getContractAddresses } from "../src/config/contracts.ts";
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import SimpleLimitOrderProtocolAbi from "../abis/SimpleLimitOrderProtocol.json" with { type: "json" };

const chainId = 8453;
const addresses = getContractAddresses(chainId);
console.log("Protocol address from config:", addresses.limitOrderProtocol);

const client = createPublicClient({
  chain: base,
  transport: http("https://erpc.up.railway.app/main/evm/8453"),
});

const order = {
  salt: 5468327398907875024531337674945653627282990244323022522990974843n,
  maker: "0x240E2588e35FB9D3D60B283B45108a49972FFFd8",
  receiver: "0x240E2588e35FB9D3D60B283B45108a49972FFFd8",
  makerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
  takerAsset: "0x8287CD2aC7E227D9D927F998EB600a0683a832A1",
  makingAmount: 10000000000000000n,
  takingAmount: 10000000000000000n,
  makerTraits: 33471150795161712739625987854991613538670879169864980536412174450159433809920n,
};

try {
  const hash = await client.readContract({
    address: addresses.limitOrderProtocol,
    abi: SimpleLimitOrderProtocolAbi.abi,
    functionName: "hashOrder",
    args: [[
      order.salt,
      order.maker,
      order.receiver,
      order.makerAsset,
      order.takerAsset,
      order.makingAmount,
      order.takingAmount,
      order.makerTraits,
    ]],
  });
  console.log("Order hash from protocol:", hash);
} catch (error) {
  console.error("Error calling hashOrder:", error);
}
