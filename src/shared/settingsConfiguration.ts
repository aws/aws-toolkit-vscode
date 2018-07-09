import * as vscode from 'vscode';

// defines helper methods for interacting with VSCode's configuration
// persistence mechanisms, allowing us to test with mocks.
export interface ISettingsConfiguration {
    readSetting<T>(settingKey: string, defaultValue?:T) : T | undefined;

    writeSetting<T>(settingKey: string, value: T, target: vscode.ConfigurationTarget) : void;
}

// default configuration settings handler for production release
export class SettingsConfiguration implements ISettingsConfiguration {
    readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
        const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix);
        if (settings) {
            const val = settings.get<T>(settingKey);
            if (val) {
                return val;
            }
        }

        if (defaultValue) {
            return defaultValue;
        }

        return undefined;
    }
    async writeSetting<T>(settingKey: string, value: T, target: vscode.ConfigurationTarget): Promise<void> {
        const settings = vscode.workspace.getConfiguration(this.extensionSettingsPrefix);
        await settings.update(settingKey, value, target);
    }

    constructor(public extensionSettingsPrefix: string) {
    }

}


