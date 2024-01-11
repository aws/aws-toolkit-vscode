/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import {
    CodeCatalystClient,
    CodeCatalystOrg,
    CodeCatalystProject,
    createClient as createCodeCatalystClient,
    DevEnvironment,
} from '../../shared/clients/codecatalystClient'
import { getThisDevEnv, prepareDevEnvConnection } from '../../codecatalyst/model'
import { Auth } from '../../auth/auth'
import { CodeCatalystAuthenticationProvider } from '../../codecatalyst/auth'
import { CodeCatalystCommands, DevEnvironmentSettings } from '../../codecatalyst/commands'
import globals from '../../shared/extensionGlobals'
import { CodeCatalystCreateWebview, SourceResponse } from '../../codecatalyst/vue/create/backend'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { AccessDeniedException } from '@aws-sdk/client-sso-oidc'
import { GetDevEnvironmentRequest } from 'aws-sdk/clients/codecatalyst'
import { getTestWindow } from '../../test/shared/vscode/window'
import { patchObject, registerAuthHook, skipTest, using } from '../../test/setupUtil'
import { isExtensionInstalled } from '../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { captureEventOnce } from '../../test/testUtil'
import { toStream } from '../../shared/utilities/collectionUtils'
import { toCollection } from '../../shared/utilities/asyncCollection'
import { getLogger } from '../../shared/logger'
import { isAwsError, ToolkitError } from '../../shared/errors'
import {
    scopesCodeCatalyst,
    createBuilderIdProfile,
    isValidCodeCatalystConnection,
    SsoConnection,
} from '../../auth/connection'
import { hasKey } from '../../shared/utilities/tsUtils'

let spaceName: CodeCatalystOrg['name']
let projectName: CodeCatalystProject['name']

/**
 * Key Information:
 *
 * This test can be run locally under the following conditions:
 *
 *   - You have previously configured BuilderId using the vscode extension.
 *     This is because this test uses BuilderId/SSO information
 *     that the extension would have naturally created in that process.
 *
 *   - A Space already exists in your CodeCatalyst account.
 *     We cannot currently automate this due to space creation
 *     not being available in the CodeCatalyst API.
 *
 *     TODO: Create a new space instead of using an existing one,
 *     if the api eventually allows us to do so.
 *
 *   - You do not have a CodeCatalyst project with the same name
 *     as {@link projectName} and {@link isolatedProjectName}.
 *     These projects are modified when this test is run.
 *
 * The test project cannot be torn down.
 *
 *   - The CodeCatalyst api does not provide a way to delete
 *     a Project. So the projects will exist in the Space unless
 *     deleted manually.
 *
 *     TODO: Delete the project when the test is done,
 *     if the api eventually allows us to do so.
 *
 * This provides a best effort to test the api functionality.
 *
 *   - There are more complexities involved in testing api functionality
 *     as if we were using the vscode UI, so this tests the underlying CC
 *     api functionliaty.
 *
 *     There are different clients in this test that are used in different
 *     parts of the CC process. Choose the best client for your usecase.
 *
 *     TODO: We can borrow some components from `src/test/globalSetup.test.ts`
 *     to be able to leverage `getTestWindow()` and then use that
 *     for UI actions testing.
 *
 *     TODO: Create separate tests that spin up a vscode extensionHost
 *     integ tests, but using the ssh hostname that we get from
 *     {@link prepareDevEnvConnection}.
 */
describe('Test how this codebase uses the CodeCatalyst API', function () {
    let client: CodeCatalystClient
    let commands: CodeCatalystCommands
    let webviewClient: CodeCatalystCreateWebview

    /**
     * Stores all dev environments created during this test suite
     */
    const testDevEnvironments: DevEnvironment[] = []

    before(async function () {
        await using(registerAuthHook('codecatalyst-test-account'), async () => {
            // These instances all interact with the CC API at some point.
            // Use the right one for your use case.
            commands = await createTestCodeCatalystCommands()
            client = await createTestCodeCatalystClient(Auth.instance)
            webviewClient = new CodeCatalystCreateWebview(client, CodeCatalystCommands.declared, () => {})

            spaceName = (await getCurrentUsersSpace()).name
            projectName = (await tryCreateTestProject(spaceName)).name
        })
    })

    beforeEach(function () {
        registerAuthHook('codecatalyst-test-account')
    })

    describe('Dev Environment functionality', function () {
        let defaultDevEnv: DevEnvironment
        let defaultDevEnvSettings: DevEnvironmentSettings

        const isolatedProjectName = 'aws-toolkit-integ-test-project-isolated'

        before(async function () {
            // Attempt to reap older dev environments associated with the test projects
            await Promise.all([deleteOldDevEnvironments(projectName), deleteOldDevEnvironments(isolatedProjectName)])

            defaultDevEnvSettings = buildDevEnvSettings()
            defaultDevEnv = await createDevEnv(defaultDevEnvSettings)
        })

        after(async function () {
            await deleteTestDevEnvs()
        })

        beforeEach(function () {
            getTestWindow().onDidShowMessage(m => {
                const updateSshConfigItem = m.items.find(i => i.title === 'Update SSH config')
                updateSshConfigItem?.select()
            })
        })

        describe('getThisDevEnv', function () {
            let ccAuth: CodeCatalystAuthenticationProvider

            before(function () {
                ccAuth = CodeCatalystAuthenticationProvider.fromContext(globals.context)
            })

            it('returns `undefined` if not in a dev environment', async function () {
                const result = await getThisDevEnv(ccAuth)
                assert.strictEqual(result, undefined)
            })

            it('returns an error if in a dev environment but the API calls fail', async function () {
                const oldEnv = { ...process.env }
                process.env['__DEV_ENVIRONMENT_ID'] = defaultDevEnv.id
                process.env['__DEV_ENVIRONMENT_SPACE_NAME'] = defaultDevEnv.org.name
                process.env['__DEV_ENVIRONMENT_PROJECT_NAME'] = 'wrong-project-name'

                try {
                    const result = await getThisDevEnv(ccAuth)
                    assert.ok(result?.isErr(), 'Expected an error to be returned')
                } finally {
                    process.env = oldEnv
                }
            })
        })

        it('creates an empty Dev Environment', async function () {
            const emptyDevEnvSettings = buildDevEnvSettings()
            const emptyDevEnv = await createDevEnvFromWebview(emptyDevEnvSettings, {
                type: 'none',
                selectedSpace: { name: spaceName },
                selectedProject: { name: projectName, org: { name: spaceName }, type: 'project' },
            })

            assert.strictEqual(emptyDevEnv.project.name, projectName)
            assert.strictEqual(emptyDevEnv.org.name, spaceName)
        })

        it('creates a Dev Environment with a different instance type + storage', async function () {
            const differentDevEnvSettings = buildDevEnvSettings('dev.standard1.medium', { sizeInGiB: 32 })

            const actualDevEnv = await createDevEnvFromWebview(differentDevEnvSettings, {
                type: 'none',
                selectedSpace: { name: spaceName },
                selectedProject: { name: projectName, org: { name: spaceName }, type: 'project' },
            })

            assert.strictEqual(actualDevEnv.project.name, projectName)
            assert.strictEqual(actualDevEnv.org.name, spaceName)
            assert.strictEqual(actualDevEnv.alias, differentDevEnvSettings.alias)
            assert.strictEqual(actualDevEnv.instanceType, 'dev.standard1.medium')
            assert.strictEqual(actualDevEnv.persistentStorage.sizeInGiB, 32)
        })

        it.skip('creates a Dev Environment using an existing branch', async function () {
            // TODO: Write this test now that an API is available in the SDK:
            // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodeCatalyst.html#createSourceRepository-property
            // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CodeCatalyst.html#createSourceRepositoryBranch-property
            // For now, the repository is manually created in the account.
        })

        it('prompts to install the ssh extension if not available', async function () {
            if (isExtensionInstalled(VSCODE_EXTENSION_ID.remotessh)) {
                skipTest(this, 'remote ssh already installed')
            }

            await assert.rejects(
                prepareDevEnvConnection(client, { ...defaultDevEnv }),
                /Remote SSH extension not installed/
            )
            const notification = await getTestWindow().waitForMessage(
                /Connecting to Dev Environment requires the Remote SSH extension/
            )

            // Normally selecting `Install...` would open up the extensions tab
            // But for this test we actually do want to install the extension programtically
            const executeCommand = vscode.commands.executeCommand
            const patchInstall = patchObject(vscode.commands, 'executeCommand', (command, ...args) => {
                if (command === 'extension.open') {
                    patchInstall.dispose()
                    return executeCommand('workbench.extensions.installExtension', ...args)
                } else {
                    return executeCommand(command, ...args)
                }
            })

            notification.selectItem('Install...')
            await captureEventOnce(vscode.extensions.onDidChange, 60_000).catch(() => {
                throw new Error('Timed out waiting to install remote SSH extension')
            })
        })

        it('connects to a running Dev Environment', async function () {
            // Get necessary objects to run the ssh command.
            const { SessionProcess, hostname, sshPath } = await prepareDevEnvConnection(client, {
                ...defaultDevEnv,
            })

            // Through the actual ssh connection, run 'ls' command in the dev env.
            const lsOutput = (await new SessionProcess(sshPath, [hostname, 'ls', '/projects']).run()).stdout

            // Assert that a certain file exists in the dev env.
            const expectedFile = 'devfile.yaml' // File automatically created by CC
            assert(lsOutput.split('\n').includes(expectedFile))
        })

        it('has environment variables that identify the Dev Environment', async function () {
            const { SessionProcess, hostname, sshPath } = await prepareDevEnvConnection(client, {
                ...defaultDevEnv,
            })

            const output = (
                await new SessionProcess(sshPath, [hostname, 'printenv', '|', 'grep', '__DEV_ENVIRONMENT']).run()
            ).stdout

            const parsed: Record<string, string> = {}
            for (const line of output.split('\n')) {
                const [_, key, value] = line.match(/(.*)=(.*)/) ?? []
                if (!key || !value) {
                    throw new Error(`Failed to parse environment variables from dev env`)
                }

                parsed[key] = value
            }

            assert.deepStrictEqual(parsed['__DEV_ENVIRONMENT_ID'], defaultDevEnv.id)
            assert.deepStrictEqual(parsed['__DEV_ENVIRONMENT_PROJECT_NAME'], defaultDevEnv.project.name)
            assert.deepStrictEqual(parsed['__DEV_ENVIRONMENT_ORGANIZATION_NAME'], defaultDevEnv.org.name)
        })

        /**
         * IMPORTANT: This test takes a while to run. Stopping a Dev Env takes time.
         */
        it('stops a running Dev Environment, then starts it up again', async function () {
            // Ensure existing Dev Env is running
            const devEnvData = {
                spaceName: defaultDevEnv.org.name,
                projectName: defaultDevEnv.project.name,
                id: defaultDevEnv.id,
            }
            await waitUntilDevEnvStatus(devEnvData, ['RUNNING'])

            // Stop Dev Env
            await client.stopDevEnvironment(devEnvData)
            await waitUntilDevEnvStatus(devEnvData, ['STOPPED'])

            // Start Dev Env
            await prepareDevEnvConnection(client, { ...defaultDevEnv })
            await waitUntilDevEnvStatus(devEnvData, ['RUNNING'])
        })

        it('updates the properties of an existing dev environment', async function () {
            const newDevEnvSettings = { alias: createAlias(), instanceType: 'dev.standard1.medium' }

            // Ensure current properties do not equal the updated properties
            assert.notStrictEqual(defaultDevEnv.alias, newDevEnvSettings.alias)
            assert.notStrictEqual(defaultDevEnv.instanceType, newDevEnvSettings.instanceType)

            // Sanity Check due to: https://issues.amazon.com/Velox-Bug-42
            assert.ok(defaultDevEnv.id, 'Dev Env ID should not be empty.')

            // Update dev env
            const updatedDevEnv = await commands.updateDevEnv(defaultDevEnv, newDevEnvSettings)

            // Ensure our update succeeded by checking for new properties
            assert.strictEqual(updatedDevEnv?.alias, newDevEnvSettings.alias)
            assert.strictEqual(updatedDevEnv?.instanceType, newDevEnvSettings.instanceType)
        })

        it('creates multiple dev envs, lists them, then deletes them', async function () {
            // We want a clean project for this test due to additional dev envs
            // from previous tests polluting the 'list dev env' output.
            await tryCreateTestProject(spaceName, isolatedProjectName)
            await deleteTestDevEnvs(isolatedProjectName)

            // Create multiple Dev Envs
            const projectSource: SourceResponse = {
                type: 'none',
                selectedSpace: { name: spaceName },
                selectedProject: { name: isolatedProjectName, org: { name: spaceName }, type: 'project' },
            }
            const createdDevEnvs = await Promise.all([
                createDevEnvFromWebview(buildDevEnvSettings(), projectSource),
                createDevEnvFromWebview(buildDevEnvSettings(), projectSource),
            ])
            assert.strictEqual(createdDevEnvs.length, 2)

            // List all Dev Envs
            const listedDevEnvs = await getAllTestDevEnvironments(isolatedProjectName)

            const actualDevEnvIds = listedDevEnvs.map(d => d.id)
            const expectedDevEnvIds = createdDevEnvs.map(d => d.id)
            assert.deepStrictEqual(
                actualDevEnvIds.sort((a, b) => a.localeCompare(b)),
                expectedDevEnvIds.sort((a, b) => a.localeCompare(b)),
                'The list dev envs dont match'
            )

            // Delete all Dev Envs
            await Promise.all(listedDevEnvs.map(devEnv => commands.deleteDevEnv(devEnv)))
            const remainingDevEnvs = await getAllTestDevEnvironments(isolatedProjectName)
            if (remainingDevEnvs.length > 0) {
                // Dev Envs may still be returned if they are still in the process of being deleted.
                // Just ensure they are in the process or fully deleted.
                remainingDevEnvs.forEach(devEnv => {
                    assert.ok(['DELETING', 'DELETED'].includes(devEnv.status), 'Dev Env was not successfully deleted')
                })
            }
        })

        it('lists all spaces for the given user', async function () {
            const spaces = await client.listSpaces().flatten().promise()
            assert.ok(spaces.find(space => space.name === spaceName))
        })

        // TODO: Re-add this test when the CoCa SDK offers a way to delete projects.
        it.skip('lists all projects for the given user', async function () {
            // Create lots of projects
            const ephemeralProjectNames = []
            for (let index = 0; index < 30; index++) {
                ephemeralProjectNames.push(`ephemeral-project-${index}`)
            }
            await Promise.all(ephemeralProjectNames.map(name => tryCreateTestProject(spaceName, name)))
            await client.listProjects({ spaceName }).flatten().promise()
        })

        function buildDevEnvSettings(
            instanceType: DevEnvironmentSettings['instanceType'] = 'dev.standard1.small',
            persistentStorage: DevEnvironmentSettings['persistentStorage'] = { sizeInGiB: 16 }
        ): DevEnvironmentSettings {
            return {
                instanceType,
                persistentStorage,
                alias: createAlias(),
                inactivityTimeoutMinutes: 15,
            }
        }

        /** Creates a unique alias for a dev environment. */
        function createAlias(): NonNullable<DevEnvironment['alias']> {
            return `test-alias-${Date.now() + Math.random()}`
        }

        async function createDevEnv(devEnvSettings: DevEnvironmentSettings): Promise<DevEnvironment> {
            const env = await client.createDevEnvironment({
                spaceName,
                projectName,
                ides: [{ name: 'VSCode' }],
                ...devEnvSettings,
            })

            testDevEnvironments.push(env)
            return env
        }

        async function createDevEnvFromWebview(
            ...args: Parameters<typeof webviewClient.createDevEnvOfType>
        ): Promise<DevEnvironment> {
            const env = await webviewClient.createDevEnvOfType(...args)
            testDevEnvironments.push(env)

            return env
        }
    })

    /**
     * Creates a CodeCatalyst commands instance.
     *
     * This holds the underlying functions that are triggered
     * when the user interacts with the vscode UI model.
     *
     * The goal is to test using this object as much as we can,
     * so we can test as close as we can to the user experience.
     * This can have interactions with vscode UI model.
     */
    async function createTestCodeCatalystCommands(): Promise<CodeCatalystCommands> {
        const ccAuthProvider = CodeCatalystAuthenticationProvider.fromContext(globals.context)
        return new CodeCatalystCommands(ccAuthProvider)
    }

    /**
     * Creates a CodeCatalyst api client.
     */
    async function createTestCodeCatalystClient(auth: Auth): Promise<CodeCatalystClient> {
        const conn = await useCodeCatalystSsoConnection(auth)
        return await createCodeCatalystClient(conn, undefined, undefined, {
            // Add retries for tests since many may be running in parallel in github CI.
            // AWS SDK adds jitter automatically.
            // https://github.com/aws/aws-sdk-js/blob/3e616251947c73d5239178c167a9d73d985ca581/lib/util.js#L884
            retryDelayOptions: {
                base: 1200, // ms
            },
            maxRetries: 5,
        })
    }

    /**
     * Returns the existing Sso connection that has been
     * verified to work with CodeCatalyst.
     *
     * A new connection will be created if one is not available.
     * The returned connection is set as the active connection if not already.
     */
    async function useCodeCatalystSsoConnection(auth: Auth): Promise<SsoConnection> {
        const builderIdSsoConnection = (await auth.listConnections()).find(isValidCodeCatalystConnection)
        const conn = builderIdSsoConnection ?? (await auth.createConnection(createBuilderIdProfile(scopesCodeCatalyst)))

        return auth.useConnection(conn)
    }

    /**
     * Creates a specific CC Project if it does not already exist in the space.
     * @param projectName The name of the test project. Be careful changing this if you plan to run locally.
     */
    async function tryCreateTestProject(
        spaceName: CodeCatalystOrg['name'],
        projectName: CodeCatalystProject['name'] = 'aws-vscode-toolkit-integ-test-project'
    ): Promise<CodeCatalystProject> {
        try {
            return await client.createProject({
                spaceName,
                displayName: projectName,
                description: 'This project is autogenerated by the AWS Toolkit VSCode Integ Test.',
            })
        } catch (e) {
            if ((isAwsError(e) || e instanceof ToolkitError) && e.code === 'ConflictException') {
                getLogger().debug(`Tried to create test project but it already exists: ${spaceName}/${projectName}`)
                return client.getProject({
                    spaceName,
                    name: projectName,
                })
            }

            throw e
        }
    }

    /**
     * Gets the first CodeCatalyst space it finds.
     *
     * The intention for this is to require no setup of a Space by the
     * user if they want to run this test locally.
     */
    async function getCurrentUsersSpace(): Promise<CodeCatalystOrg> {
        const firstPageOfSpaces = (await client.listSpaces().iterator().next()).value

        if (firstPageOfSpaces === undefined || firstPageOfSpaces.length === 0) {
            // Space must already exist due to CC not providing an api to create a space.
            throw new Error(
                'No spaces found in account. A CodeCatalyst Space must be created manually before running this test.'
            )
        }

        const firstSpaceFound = firstPageOfSpaces[0]
        return firstSpaceFound
    }

    /**
     * Deletes any existing dev envs created by this test suite, resolves only
     * once all are fully deleted on the server side. Can optionally filter per-project.
     */
    async function deleteTestDevEnvs(projectName?: CodeCatalystProject['name']): Promise<void> {
        const environments = await getAllTestDevEnvironments(projectName)

        // Deleting a dev env that has already been deleted will throw an error.
        // We need to be selective about which dev envs get explicitly deleted.
        const devEnvsToDelete = environments
            .filter(devEnv => !['DELETING', 'DELETED'].includes(devEnv.status))
            .map(async devEnv => deleteDevEnv(devEnv.project.name, devEnv.id))

        // These dev envs are already in the process of being deleted, so we just need to wait until they are fully deleted.
        const devEnvsToWaitForDeletion = environments
            .filter(devEnv => ['DELETING'].includes(devEnv.status))
            .map(async devEnv => waitUntilDevEnvDeleted(devEnv.project.name, devEnv.id))

        await Promise.all([...devEnvsToDelete, ...devEnvsToWaitForDeletion])
    }

    /**
     * Deletes all dev environments associated with the project that are older than one day
     */
    async function deleteOldDevEnvironments(projectName: CodeCatalystProject['name']): Promise<void> {
        const environments = await getAllDevEnvs(projectName)

        // Deleting a dev env that has already been deleted will throw an error.
        // We need to be selective about which dev envs get explicitly deleted.
        const oneDayInMs = 60 * 60 * 24 * 1000
        await Promise.all(
            environments
                .filter(devEnv => Date.now() - devEnv.lastUpdatedTime.getTime() >= oneDayInMs)
                .filter(devEnv => !['DELETING', 'DELETED'].includes(devEnv.status))
                .map(devEnv =>
                    deleteDevEnv(devEnv.project.name, devEnv.id).catch(err => {
                        getLogger().warn(`tests: failed to deleted old dev environment "${devEnv.id}": %s`, err)
                    })
                )
        )
    }

    async function getAllDevEnvs(projectName: CodeCatalystProject['name']): Promise<DevEnvironment[]> {
        const currentDevEnvs = await client
            .listDevEnvironments({ name: projectName, org: { name: spaceName }, type: 'project' })
            .flatten()
            .promise()
        return currentDevEnvs
    }

    function getAllTestDevEnvironments(projectName?: CodeCatalystProject['name']) {
        const projects = Array.from(
            testDevEnvironments.map(env => env.project.name).reduce((set, name) => set.add(name), new Set<string>())
        )

        const currentDevEnvs = toCollection(() => toStream(projects.map(name => getAllDevEnvs(name))))
            .flatten()
            .filter(env => !!testDevEnvironments.find(other => other.id === env.id))
            .filter(env => !projectName || env.project.name === projectName)

        return currentDevEnvs.promise()
    }

    /**
     * Deletes a specific dev env and only returns when it is fully
     * deleted on the server
     */
    async function deleteDevEnv(projectName: CodeCatalystProject['name'], id: DevEnvironment['id']): Promise<void> {
        await commands.deleteDevEnv({
            org: { name: spaceName },
            project: { name: projectName },
            id: id,
        })

        return waitUntilDevEnvDeleted(projectName, id)
    }

    /**
     * waits until the dev env is fully deleted in the server.
     *
     * This function is needed specifically for a dev env in the deletion
     * process since an error will be thrown when we try to get the dev environment
     * but it has been successfully deleted.
     */
    async function waitUntilDevEnvDeleted(projectName: CodeCatalystProject['name'], id: DevEnvironment['id']) {
        const result = await waitUntil(
            async function () {
                let devEnvBeingDeleted: DevEnvironment
                try {
                    devEnvBeingDeleted = await client.getDevEnvironment({ spaceName, projectName, id })
                } catch (e: any) {
                    // Cannot use isAwsError() because the client actually returns a regular Error
                    // with a 'code' property for this call.
                    if (hasKey(e, 'code') && e.code === AccessDeniedException.name) {
                        // This error is thrown because the dev env does not exist anymore
                        // on the server. The name doesn't make it obvious IMO.
                        return true
                    }
                    throw e
                }
                return devEnvBeingDeleted.status === 'DELETED'
            },
            {
                interval: 1000,
                timeout: 60000,
            }
        )
        if (!result) {
            throw new Error(`Dev env ${id} did not transition to DELETED status before timeout.`)
        }
    }

    /**
     * Asserts that a given dev env has one of the given statuses, it will fail
     * if the timeout is reached.
     */
    async function waitUntilDevEnvStatus(
        devEnv: GetDevEnvironmentRequest,
        status: DevEnvironment['status'][]
    ): Promise<void> {
        const result = await waitUntil(
            async function () {
                const devEnvData = await client.getDevEnvironment({
                    spaceName: devEnv.spaceName,
                    projectName: devEnv.projectName,
                    id: devEnv.id,
                })
                return status.includes(devEnvData.status)
            },
            {
                interval: 1000,
                timeout: 120000,
            }
        )

        if (!result) {
            throw new Error(
                `Dev env ${devEnv.id} did not transition to one of the following statuses before timeout: "${status}"`
            )
        }
    }
})
