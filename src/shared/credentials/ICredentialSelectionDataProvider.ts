'use strict';

import { QuickPickItem, QuickInputButton, Uri } from "vscode";
import { MultiStepInputFlowController } from "../multiStepInputFlowController";

export class AddProfileButton implements QuickInputButton {
    constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
}

export interface ICredentialSelectionState {
    title: string;
    step: number;
    totalSteps: number;
    credentialProfile: QuickPickItem | undefined;
    accesskey: string;
    secretKey: string;
    profileName: string;
}

export interface ICredentialSelectionDataProvider {
    existingProfileNames: string[];
    pickCredentialProfile(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>): Promise<QuickPickItem | AddProfileButton>;
    inputProfileName(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined>;
    inputAccessKey(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined>;
    inputSecretKey(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined>;
}
