import {
    AptosAccount,
    BCS,
    FaucetClient,
    HexString,
    Network as V1Network,
    Provider,
    TxnBuilderTypes
} from "aptos";
import axios from "axios";
import {Account, Aptos, AptosConfig, Hex, Network as V2Network, Serializer} from "@aptos-labs/ts-sdk";


const stringify = (input: Object) => JSON.stringify(input, (key, value) => {
    if (typeof value === "bigint") {
        return value.toString() + "n";
    } else if (value instanceof Uint8Array) {
        return HexString.fromUint8Array(value).hex()
    } else {
        return value
    }
}, 2);
const mainV1 = async () => {
    console.log(" === V1 === ");
// Generate a random account for purposes of this test
    const account = new AptosAccount();
    const provider = new Provider(V1Network.DEVNET);

    // Fund account so it works for this test
    const faucet = new FaucetClient("https://fullnode.devnet.aptoslabs.com", "https://faucet.devnet.aptoslabs.com");
    await faucet.fundAccount(account.address().hex(), 100000000);

    // Now create a transaction
    const rawTxn = await provider.generateRawTransaction(account.address(), new TxnBuilderTypes.TransactionPayloadEntryFunction(TxnBuilderTypes.EntryFunction.natural(
        "0x1::aptos_account",
        "transfer",
        [],
        [TxnBuilderTypes.AccountAddress.fromHex("0x1").address, BCS.bcsSerializeUint64(100)]
    )));

    // Sign the transaction, this returns an already BCS encoded transaction, so we decode it for visibility
    const bcsSignedTxn = await provider.signTransaction(account, rawTxn);
    const bcsDeserializer = new BCS.Deserializer(bcsSignedTxn);
    const signedTxn = TxnBuilderTypes.SignedTransaction.deserialize(bcsDeserializer);

    // Show the signed txn
    console.log(`Signed TXN from signer: ${stringify(signedTxn)}`);

    // Here we have the signed transaction, we can send it two ways, BCS serialized or JSON.  We choose BCS first
    const bcsSerializer = new BCS.Serializer();
    signedTxn.serialize(bcsSerializer);
    const serializedBytes = bcsSerializer.getBytes();

    // Convert this to hex for portability
    const hexBytes = HexString.fromUint8Array(serializedBytes).hex();

    console.log(`Sending BCS: ${hexBytes}`);

    // Now we can send this transaction to the proxy
    await axios.post(`http://localhost:9898/v1/submit/bcs`, {bytes: hexBytes}, {})

    // But, wait there's more.  Let's try to send via JSON
    const rawTxn2 = await provider.generateRawTransaction(account.address(), new TxnBuilderTypes.TransactionPayloadEntryFunction(TxnBuilderTypes.EntryFunction.natural(
        "0x1::aptos_account",
        "transfer",
        [],
        [TxnBuilderTypes.AccountAddress.fromHex("0x1").address, BCS.bcsSerializeUint64(100)]
    )));

    // Sign the transaction, this returns an already BCS encoded transaction, so we decode it for visibility
    const bcsSignedTxn2 = await provider.signTransaction(account, rawTxn2);
    const bcsDeserializer2 = new BCS.Deserializer(bcsSignedTxn2);
    const signedTxn2 = TxnBuilderTypes.SignedTransaction.deserialize(bcsDeserializer2);

    // Show the signed txn
    console.log(`Signed TXN from signer: ${stringify(signedTxn2)}`);

    const strSignedTxn = stringify(signedTxn2);
    console.log(`Sending BCS: ${strSignedTxn}`);
    await axios.post(`http://localhost:9898/v1/submit/json`, {payload: strSignedTxn}, {})
};


const mainV2 = async () => {
    console.log(" === V2 === ");
// Generate a random account for purposes of this test
    const signer = Account.generate();
    const aptosConfig = new AptosConfig({network: V2Network.DEVNET});
    const aptos = new Aptos(aptosConfig);

    await aptos.fundAccount({accountAddress: signer.accountAddress, amount: 100000000});

    const transaction = await aptos.build.transaction({
        sender: signer.accountAddress, data: {
            function: "0x1::aptos_account::transfer",
            typeArguments: [],
            functionArguments: [signer.accountAddress, 100]
        }
    });
    const authenticator = aptos.sign.transaction({signer, transaction});

    console.log(`RawTxn: ${stringify(transaction)}, authenticator: ${stringify(authenticator)}`);

    // For this case, we're skipping multisigner and fee payer
    const serializer = new Serializer();
    transaction.rawTransaction.serialize(serializer);
    authenticator.serialize(serializer);
    const hexBytes = new Hex(serializer.toUint8Array()).toString();

    console.log(`Sending BCS: ${hexBytes}`);
    await axios.post(`http://localhost:9898/v2/submit/bcs`, {bytes: hexBytes}, {})
};

Promise.resolve(mainV1()).then(r => console.log("V1 Complete"));
Promise.resolve(mainV2()).then(r => console.log("V2 Complete"));