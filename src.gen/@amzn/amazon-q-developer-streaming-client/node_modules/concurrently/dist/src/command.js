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
exports.Command = void 0;
const Rx = __importStar(require("rxjs"));
class Command {
    constructor({ index, name, command, prefixColor, env, cwd }, spawnOpts, spawn, killProcess) {
        this.close = new Rx.Subject();
        this.error = new Rx.Subject();
        this.stdout = new Rx.Subject();
        this.stderr = new Rx.Subject();
        this.timer = new Rx.Subject();
        this.killed = false;
        this.exited = false;
        this.index = index;
        this.name = name;
        this.command = command;
        this.prefixColor = prefixColor;
        this.env = env;
        this.cwd = cwd;
        this.killProcess = killProcess;
        this.spawn = spawn;
        this.spawnOpts = spawnOpts;
    }
    get killable() {
        return !!this.process;
    }
    /**
     * Starts this command, piping output, error and close events onto the corresponding observables.
     */
    start() {
        const child = this.spawn(this.command, this.spawnOpts);
        this.process = child;
        this.pid = child.pid;
        const startDate = new Date(Date.now());
        const highResStartTime = process.hrtime();
        this.timer.next({ startDate });
        Rx.fromEvent(child, 'error').subscribe(event => {
            this.process = undefined;
            const endDate = new Date(Date.now());
            this.timer.next({ startDate, endDate });
            this.error.next(event);
        });
        Rx.fromEvent(child, 'close').subscribe(([exitCode, signal]) => {
            this.process = undefined;
            this.exited = true;
            const endDate = new Date(Date.now());
            this.timer.next({ startDate, endDate });
            const [durationSeconds, durationNanoSeconds] = process.hrtime(highResStartTime);
            this.close.next({
                command: this,
                index: this.index,
                exitCode: exitCode === null ? signal : exitCode,
                killed: this.killed,
                timings: {
                    startDate,
                    endDate,
                    durationSeconds: durationSeconds + (durationNanoSeconds / 1e9),
                }
            });
        });
        child.stdout && pipeTo(Rx.fromEvent(child.stdout, 'data'), this.stdout);
        child.stderr && pipeTo(Rx.fromEvent(child.stderr, 'data'), this.stderr);
        this.stdin = child.stdin;
    }
    /**
     * Kills this command, optionally specifying a signal to send to it.
     */
    kill(code) {
        if (this.killable) {
            this.killed = true;
            this.killProcess(this.pid, code);
        }
    }
}
exports.Command = Command;
;
/**
 * Pipes all events emitted by `stream` into `subject`.
 */
function pipeTo(stream, subject) {
    stream.subscribe(event => subject.next(event));
}
