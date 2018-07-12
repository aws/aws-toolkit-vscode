import * as vscode from 'vscode';
import * as path from 'path';
import { ext } from "../shared/extensionGlobals";
import { ScriptResource } from '../lambda/models/scriptResource';
import * as _ from 'lodash';

export class ExtensionUtilities {
    public static getLibrariesForHtml(names: string[]): ScriptResource[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'libs');
        return this.resolveResourceURIs(basePath, names);
    }
    public static getScriptsForHtml(names: string[]): ScriptResource[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'js');
        return this.resolveResourceURIs(basePath, names);
    }

    private static resolveResourceURIs(basePath: string, names: string[]): ScriptResource[] {
        const scripts: ScriptResource[] = [];
        _.forEach(names, (scriptName) => {
            const scriptPathOnDisk = vscode.Uri.file(path.join(basePath, scriptName));
            const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
            const nonce = ExtensionUtilities.getNonce();
            scripts.push({ Nonce: nonce, Uri: scriptUri });
        });
        return scripts;
    }

    public static getNonce(): string {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}