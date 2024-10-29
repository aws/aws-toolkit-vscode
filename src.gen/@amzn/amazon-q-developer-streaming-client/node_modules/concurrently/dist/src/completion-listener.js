"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionListener = void 0;
const Rx = __importStar(require("rxjs"));
const operators_1 = require("rxjs/operators");
/**
 * Provides logic to determine whether lists of commands ran successfully.
*/
class CompletionListener {
    constructor({ successCondition = 'all', scheduler }) {
        this.successCondition = successCondition;
        this.scheduler = scheduler;
    }
    isSuccess(exitCodes) {
        switch (this.successCondition) {
            /* eslint-disable indent */
            case 'first':
                return exitCodes[0] === 0;
            case 'last':
                return exitCodes[exitCodes.length - 1] === 0;
            default:
                return exitCodes.every(exitCode => exitCode === 0);
            /* eslint-enable indent */
        }
    }
    /**
     * Given a list of commands, wait for all of them to exit and then evaluate their exit codes.
     *
     * @returns A Promise that resolves if the success condition is met, or rejects otherwise.
     */
    listen(commands) {
        const closeStreams = commands.map(command => command.close);
        return Rx.merge(...closeStreams)
            .pipe((0, operators_1.bufferCount)(closeStreams.length), (0, operators_1.switchMap)(exitInfos => this.isSuccess(exitInfos.map(({ exitCode }) => exitCode))
            ? Rx.of(exitInfos, this.scheduler)
            : Rx.throwError(exitInfos, this.scheduler)), (0, operators_1.take)(1))
            .toPromise();
    }
}
exports.CompletionListener = CompletionListener;
;
