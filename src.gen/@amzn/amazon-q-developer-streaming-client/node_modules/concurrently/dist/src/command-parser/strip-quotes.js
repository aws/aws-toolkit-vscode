"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripQuotes = void 0;
/**
 * Strips quotes around commands so that they can run on the current shell.
 */
class StripQuotes {
    parse(commandInfo) {
        let { command } = commandInfo;
        // Removes the quotes surrounding a command.
        if (/^"(.+?)"$/.test(command) || /^'(.+?)'$/.test(command)) {
            command = command.substr(1, command.length - 2);
        }
        return Object.assign({}, commandInfo, { command });
    }
}
exports.StripQuotes = StripQuotes;
;
