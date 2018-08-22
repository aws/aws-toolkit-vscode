'use strict';

import * as vscode from 'vscode';

// defines helper methods for interacting with VSCode's configuration
// persistence mechanisms, allowing us to test with mocks.
export interface ISettingsConfiguration {
    readSetting(settingKey: string, defaultValue?:string) : string | undefined;

    // array values are serialized as a comma-delimited string
    writeSetting(settingKey: string, value: string | string[] | undefined, target: vscode.ConfigurationTarget) : void;
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
    async writeSetting(settingKey: string, value: string | string[], target: vscode.ConfigurationTarget): Promise<void> {
        const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix);
        let persistedValue: string;
        if (value && value instanceof Array) {
            persistedValue = value.join();
        } else {
            persistedValue = value;
        }

        await settings.update(settingKey, persistedValue, target);
    }

    constructor(public extensionSettingsPrefix: string) {
    }

}


