import {BCS, HexString, MaybeHexString, Network as V1Network, Provider, TxnBuilderTypes} from "aptos";
import express, {NextFunction, Request, Response} from 'express';
import {
    AccountAuthenticator,
    Aptos,
    AptosConfig,
    Deserializer,
    Hex,
    Network as V2Network,
    RawTransaction
} from "@aptos-labs/ts-sdk";

/**
 * A matching type to the message sent by the demo, does not apply to ever transaction
 */
type SignedTransactionJson = {
    "raw_txn": {
        "sender": {
            "address": string
        },
        "sequence_number": bigint,
        "payload": {
            "value": {
                "module_name": {
                    "address": {
                        "address": string
                    },
                    "name": {
                        "value": string
                    }
                },
                "function_name": {
                    "value": string
                },
                "ty_args": string[],
                "args": string[]
            }
        },
        "max_gas_amount": bigint,
        "gas_unit_price": bigint,
        "expiration_timestamp_secs": bigint,
        "chain_id": {
            "value": number
        }
    },
    "authenticator": {
        "public_key": {
            "value": string
        },
        "signature": {
            "value": string
        }
    }
};


/**
 * This is to get around bigint issues
 * @param input
 */
const stringify = (input: Object) => JSON.stringify(input, (key, value) => {
    if (typeof value === "bigint") {
        return value.toString() + "n";
    } else if (value instanceof Uint8Array) {
        return HexString.fromUint8Array(value).hex()
    } else {
        return value
    }
}, 2);

/**
 * This is to get around bigint issues
 * @param input
 */
const parseJson = <T extends {}>(input: string) => {
    return JSON.parse(input, (key, value) => {
        if (typeof value === "string" && /^\d+n$/.test(value)) {
            return BigInt(value.substring(0, value.length - 1));
        }
        return value;
    }) as T;
}

/**
 * This proxy server takes requests from the application and forwards them to the blockchain.
 */
const proxyServer = async () => {
    const provider = new Provider(V1Network.DEVNET);
    const aptos = new Aptos(new AptosConfig({network: V2Network.DEVNET}));
    const app = express();
    app.disable('x-powered-by');

    app.use(express.json());
    app.use((req: Request, res: Response, next: NextFunction) => {
        let send = res.send;
        res.send = c => {
            console.log(`Req: ${req.url} Code: ${res.statusCode}`);
            res.send = send;
            return res.send(c);
        }
        next();
    });

    app.listen(9898, () => {
        console.log("Proxy server listening on PORT: 9898",);
    });

    // Here is an example sending it over the wire in JSON
    app.post("/v1/submit/json", async (request: Request, response: Response) => {
        const body = request.body.payload as string;

        console.log(`Received /v1/submit/json ${stringify(body)}`);
        // JSON is special, we have to do extra special parsing
        const signedTransaction: SignedTransactionJson = parseJson(body);
        console.log(`JSON version: ${signedTransaction}`);

        // Because you cannot load a class directly from JSON, we have to MANUALLY convert this to a SignedTransaction
        // in order to access the serialize function.  This was not meant to be used in this fashion
        // FIXME: this is a hack and not sustainable, because it would need to handle all shapes and add extra logic for each please use BCS
        const parsedSignedTransaction = new TxnBuilderTypes.SignedTransaction(
            new TxnBuilderTypes.RawTransaction(
                TxnBuilderTypes.AccountAddress.fromHex(signedTransaction.raw_txn.sender.address),
                signedTransaction.raw_txn.sequence_number,
                new TxnBuilderTypes.TransactionPayloadEntryFunction(
                    TxnBuilderTypes.EntryFunction.natural(
                        `${HexString.ensure(signedTransaction.raw_txn.payload.value.module_name.address.address).toShortString()}}::${signedTransaction.raw_txn.payload.value.module_name.name.value}`,
                        signedTransaction.raw_txn.payload.value.function_name.value,
                        [], // No type tags supported here
                        signedTransaction.raw_txn.payload.value.args.map(arg => HexString.ensure(arg).toUint8Array()),
                    )
                ),
                signedTransaction.raw_txn.max_gas_amount,
                signedTransaction.raw_txn.gas_unit_price,
                signedTransaction.raw_txn.expiration_timestamp_secs,
                new TxnBuilderTypes.ChainId(signedTransaction.raw_txn.chain_id.value),
            ),
            new TxnBuilderTypes.TransactionAuthenticatorEd25519(
                new TxnBuilderTypes.Ed25519PublicKey(HexString.ensure(signedTransaction.authenticator.public_key.value).toUint8Array()),
                new TxnBuilderTypes.Ed25519Signature(HexString.ensure(signedTransaction.authenticator.signature.value).toUint8Array())
            )
        );

        // Log the input
        console.log(`Deserialized transaction from JSON as ${stringify(parsedSignedTransaction)}`);


        // submit it!
        // Serialize to submit
        const serializer = new BCS.Serializer();
        parsedSignedTransaction.serialize(serializer);
        const pendingTransaction = await provider.submitTransaction(serializer.getBytes());

        // Let's wait for the transaction to complete to ensure that it works in this demo
        await provider.waitForTransaction(pendingTransaction.hash);
        console.log(`Succeeded on ${pendingTransaction.hash}`)

        // In the event everything is all good, send a 200
        response.sendStatus(200);

    });

    // Here is an example of how BCS can be used across the wire, but you can reconstruct on both sides
    app.post("/v1/submit/bcs", async (request: Request, response: Response) => {
        const body = request.body.bytes as string;
        console.log(`Received /v1/submit/bcs ${stringify(body)}`);

        const signedTransactionBytes = HexString.ensure(body).toUint8Array();

        // Deserialize the signed transaction
        const deserializer = new BCS.Deserializer(signedTransactionBytes);
        const signedTransaction: TxnBuilderTypes.SignedTransaction = TxnBuilderTypes.SignedTransaction.deserialize(deserializer);

        // Log the input
        console.log(`Deserialized transaction from BCS as ${stringify(signedTransaction)}`);

        // submit it!
        // Serialize to submit
        const serializer = new BCS.Serializer();
        signedTransaction.serialize(serializer);
        const pendingTransaction = await provider.submitTransaction(serializer.getBytes());

        // Let's wait for the transaction to complete to ensure that it works in this demo
        await provider.waitForTransaction(pendingTransaction.hash);
        console.log(`Succeeded on ${pendingTransaction.hash}`)

        // In the event everything is all good, send a 200
        response.sendStatus(200);
    });


    // Here is an example of how BCS can be used across the wire, but you can reconstruct on both sides
    app.post("/v2/submit/bcs", async (request: Request, response: Response) => {
        const body = request.body.bytes as string;

        console.log(`Received /v2/submit/bcs ${stringify(body)}`);

        const signedTransactionBytes = Hex.fromString(body).toUint8Array();

        // Deserialize the signed transaction
        const deserializer = new Deserializer(signedTransactionBytes);
        const rawTransaction = RawTransaction.deserialize(deserializer);
        const authenticator = AccountAuthenticator.deserialize(deserializer);

        // TODO: SingleSenderTransaction isn't exported
        const transaction = {
            rawTransaction,
        }
        // Log the input
        console.log(`Deserialized transaction from BCS as ${stringify(transaction)} : ${stringify(authenticator)}`);

        // submit it!
        const pendingTransaction = await aptos.submit.transaction({transaction, senderAuthenticator: authenticator});

        // Let's wait for the transaction to complete to ensure that it works in this demo
        await provider.waitForTransaction(pendingTransaction.hash);
        console.log(`Succeeded on ${pendingTransaction.hash}`)

        // In the event everything is all good, send a 200
        response.sendStatus(200);
    });
}

proxyServer().catch(console.error);
