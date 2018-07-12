'use strict';

import * as vscode from 'vscode';

// defines helper methods for interacting with VSCode's configuration
// persistence mechanisms, allowing us to test with mocks.
export interface ISettingsConfiguration {
    readSetting(settingKey: string, defaultValue?:string) : string | undefined;

    writeSetting(settingKey: string, value: string, target: vscode.ConfigurationTarget) : void;
}

// default configuration settings handler for production release
export class SettingsConfiguration implements ISettingsConfiguration {
    readSetting(settingKey: string, defaultValue?: string): string | undefined {
        const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix);
        if (settings) {
            const val = settings.get<string>(settingKey);
            if (val) {
                return val;
            }
        }

        if (defaultValue) {
            return defaultValue;
        }

        return undefined;
    }
    async writeSetting(settingKey: string, value: string, target: vscode.ConfigurationTarget): Promise<void> {
        const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix);
        await settings.update(settingKey, value, target);
    }

    constructor(public extensionSettingsPrefix: string) {
    }

}


