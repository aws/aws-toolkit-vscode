'use strict'

import { CredentialsFileReaderWriter } from "./credentialsFileReaderWriter"
import { loadSharedConfigFiles, saveProfile } from "./credentialsFile"

export class DefaultCredentialsFileReaderWriter implements CredentialsFileReaderWriter {
    async getProfileNames(): Promise<string[]> {
        let profileNames: string[] = []

        // TODO: cache the file and attach a watcher to it
        const credentialFiles = await loadSharedConfigFiles()
        profileNames = Object.keys(credentialFiles.credentialsFile)

        return new Promise<string[]>(resolve => {
            resolve(profileNames)
        })
    }

    async addProfileToFile(profileName: string, accessKey: string, secretKey: string): Promise<void> {
        await saveProfile(profileName, accessKey, secretKey)
    }
}