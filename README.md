## Separation of signing and submission demo

Note that the JSON transfer between both is purely for demonstration purposes.  BCS should be used
for all transfers between machines, as it's more efficient, with greater fidelity, and it just works.

### Scope

This shows how to implement signing a simple 100 coin transfer in SDK v1 and in SDK v2.  A signer
server signs and submits transactions to another server which is a proxy for the full node.  This proxy
has the full ability to view the plaintext versions of the transactions without doing anything extra.

### How to run

1. Start the proxy server `pnpm start-proxy`
2. Start the demo signer `pnpm start-signer`

It will then print out things in both consoles associated with the changes that will be made.
