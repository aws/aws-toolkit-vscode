"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.concurrently = void 0;
const assert_1 = __importDefault(require("assert"));
const lodash_1 = __importDefault(require("lodash"));
const spawn_command_1 = __importDefault(require("spawn-command"));
const tree_kill_1 = __importDefault(require("tree-kill"));
const command_1 = require("./command");
const expand_npm_shortcut_1 = require("./command-parser/expand-npm-shortcut");
const expand_npm_wildcard_1 = require("./command-parser/expand-npm-wildcard");
const strip_quotes_1 = require("./command-parser/strip-quotes");
const completion_listener_1 = require("./completion-listener");
const get_spawn_opts_1 = require("./get-spawn-opts");
const output_writer_1 = require("./output-writer");
const defaults = {
    spawn: spawn_command_1.default,
    kill: tree_kill_1.default,
    raw: false,
    controllers: [],
    cwd: undefined,
};
/**
 * Core concurrently functionality -- spawns the given commands concurrently and
 * returns the commands themselves + the result according to the specified success condition.
 *
 * @see CompletionListener
 */
function concurrently(baseCommands, baseOptions) {
    assert_1.default.ok(Array.isArray(baseCommands), '[concurrently] commands should be an array');
    assert_1.default.notStrictEqual(baseCommands.length, 0, '[concurrently] no commands provided');
    const options = lodash_1.default.defaults(baseOptions, defaults);
    const commandParsers = [
        new strip_quotes_1.StripQuotes(),
        new expand_npm_shortcut_1.ExpandNpmShortcut(),
        new expand_npm_wildcard_1.ExpandNpmWildcard()
    ];
    let lastColor = '';
    let commands = (0, lodash_1.default)(baseCommands)
        .map(mapToCommandInfo)
        .flatMap(command => parseCommand(command, commandParsers))
        .map((command, index) => {
        // Use documented behaviour of repeating last color when specifying more commands than colors
        lastColor = options.prefixColors && options.prefixColors[index] || lastColor;
        return new command_1.Command(Object.assign({
            index,
            prefixColor: lastColor,
        }, command), (0, get_spawn_opts_1.getSpawnOpts)({
            raw: options.raw,
            env: command.env,
            cwd: command.cwd || options.cwd,
        }), options.spawn, options.kill);
    })
        .value();
    const handleResult = options.controllers.reduce(({ commands: prevCommands, onFinishCallbacks }, controller) => {
        const { commands, onFinish } = controller.handle(prevCommands);
        return {
            commands,
            onFinishCallbacks: lodash_1.default.concat(onFinishCallbacks, onFinish ? [onFinish] : [])
        };
    }, { commands, onFinishCallbacks: [] });
    commands = handleResult.commands;
    if (options.logger) {
        const outputWriter = new output_writer_1.OutputWriter({
            outputStream: options.outputStream,
            group: options.group,
            commands,
        });
        options.logger.output.subscribe(({ command, text }) => outputWriter.write(command, text));
    }
    const commandsLeft = commands.slice();
    const maxProcesses = Math.max(1, Number(options.maxProcesses) || commandsLeft.length);
    for (let i = 0; i < maxProcesses; i++) {
        maybeRunMore(commandsLeft);
    }
    const result = new completion_listener_1.CompletionListener({ successCondition: options.successCondition })
        .listen(commands)
        .finally(() => {
        handleResult.onFinishCallbacks.forEach((onFinish) => onFinish());
    });
    return {
        result,
        commands,
    };
}
exports.concurrently = concurrently;
;
function mapToCommandInfo(command) {
    if (typeof command === 'string') {
        return {
            command,
            name: '',
            env: {},
            cwd: '',
        };
    }
    return Object.assign({
        command: command.command,
        name: command.name || '',
        env: command.env || {},
        cwd: command.cwd || '',
    }, command.prefixColor ? {
        prefixColor: command.prefixColor,
    } : {});
}
function parseCommand(command, parsers) {
    return parsers.reduce((commands, parser) => lodash_1.default.flatMap(commands, command => parser.parse(command)), lodash_1.default.castArray(command));
}
function maybeRunMore(commandsLeft) {
    const command = commandsLeft.shift();
    if (!command) {
        return;
    }
    command.start();
    command.close.subscribe(() => {
        maybeRunMore(commandsLeft);
    });
}
