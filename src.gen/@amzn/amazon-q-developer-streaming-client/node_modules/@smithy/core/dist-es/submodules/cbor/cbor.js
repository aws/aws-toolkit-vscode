import { decode, setPayload } from "./cbor-decode";
import { encode, resize, toUint8Array } from "./cbor-encode";
export const cbor = {
    deserialize(payload) {
        setPayload(payload);
        return decode(0, payload.length);
    },
    serialize(input) {
        encode(input);
        return toUint8Array();
    },
    resizeEncodingBuffer(size) {
        resize(size);
    },
};
