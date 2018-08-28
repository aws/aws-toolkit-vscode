import * as assert from 'assert';
import { credentialProfileSelector } from '../shared/credentials/credentialProfileSelector';
import { ICredentialSelectionDataProvider, ICredentialSelectionState, AddProfileButton } from '../shared/credentials/ICredentialSelectionDataProvider';
import { MultiStepInputFlowController } from '../shared/multiStepInputFlowController';
import { QuickPickItem, Uri } from 'vscode';

suite("CredentialProfileSelector Tests", function (): void {

    test('selector stops on selection of existing profile name', async function() {

        // need to find a better mock solution
        class MockCredentialSelectionDataProvider implements ICredentialSelectionDataProvider {
            constructor(public readonly existingProfileNames: string[]) {
            }

            async pickCredentialProfile(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>): Promise<QuickPickItem | AddProfileButton> {
                return new Promise<QuickPickItem | AddProfileButton>(resolve => {
                    resolve({ label: this.existingProfileNames[1] });
                });
            }
            async inputProfileName(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined> {
                return "shouldNeverGetHere";
            }
            async inputAccessKey(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined> {
                return undefined;
            }
            async inputSecretKey(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined> {
                return undefined;
            }
        }

        const profileNames: string[] = [
            'profile1',
            'profile2',
            'profile3'
        ];

        const dataProvider = new MockCredentialSelectionDataProvider(profileNames);
        const state = await credentialProfileSelector(dataProvider);
        return new Promise((resolve, reject) => {
            if (state && state.credentialProfile) {
                assert.equal(state.credentialProfile.label, profileNames[1]);
                assert.equal(state.profileName, undefined);
                resolve();
            } else {
                reject('state or the credentialProfile member is undefined, expected a profile name');
            }
        });
    });

    test('selector returns new profile details', async function() {

        // need to find a better mock solution
        const button = new AddProfileButton({
            dark: Uri.file('resources/dontcare'),
            light: Uri.file('resources/dontcare')
        },
        'dontcare');

        class MockCredentialSelectionDataProvider implements ICredentialSelectionDataProvider {
            constructor(public readonly existingProfileNames: string[]) {
            }

            async pickCredentialProfile(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>): Promise<QuickPickItem | AddProfileButton> {
                return new Promise<QuickPickItem | AddProfileButton>(resolve => {
                    resolve(button);
                });
            }
            async inputProfileName(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined> {
                return 'newProfileName';
            }
            async inputAccessKey(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined> {
                return 'newAccesskey';
            }
            async inputSecretKey(input: MultiStepInputFlowController, state: Partial<ICredentialSelectionState>) : Promise<string | undefined> {
                return 'newSecretkey';
            }
        }

        const profileNames: string[] = [
        ];

        const dataProvider = new MockCredentialSelectionDataProvider(profileNames);
        const state = await credentialProfileSelector(dataProvider);
        return new Promise((resolve, reject) => {
            if (state) {
                assert.equal(state.credentialProfile, undefined);
                assert.equal(state.profileName, 'newProfileName');
                assert.equal(state.accesskey, 'newAccesskey');
                assert.equal(state.secretKey, 'newSecretkey');
                resolve();
            } else {
                reject('state is undefined');
            }
        });
    });
});
