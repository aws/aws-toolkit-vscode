"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from TypeScript Lambda!'
        })
    };
};
exports.handler = handler;
//# sourceMappingURL=handler.js.map
