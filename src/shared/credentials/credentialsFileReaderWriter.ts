'use strict';

export interface CredentialsFileReaderWriter {
    // returns the list of available profile names
    getProfileNames(): Promise<string[]>;

    // writes a new profile to the credential file
    addProfileToFile(profileName: string, accessKey: string, secretKet: string): Promise<void>;
}