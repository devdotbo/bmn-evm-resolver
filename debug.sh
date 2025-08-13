HASH=0x224bcb933cf3982777c96adbb6b617aecf102fc098a3a97ae50d2f935c9961d1
CAL=calldata/$HASH.json
TO=$(jq -r .to $CAL)
FROM=$(jq -r .from $CAL)
DATA=$(jq -r .data $CAL)
CHAIN=$(jq -r .chainId $CAL)
RPC=$([ "$CHAIN" = "10" ] && echo https://erpc.up.railway.app/main/evm/10 || echo https://erpc.up.railway.app/main/evm/8453)

ERR=$(curl -s -X POST -H 'content-type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"$TO\",\"from\":\"$FROM\",\"data\":\"$DATA\"},\"latest\"]}" \
  "$RPC" | jq -r '.error.data // empty')

echo "$ERR"
