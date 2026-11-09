/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

import { TestFolder } from '../../testUtil'
import { samconfigCompleteData, samconfigCompleteDataWithoutGlobal, samconfigInvalidData } from './samTestUtils'
import {
    createNewConfigFile,
    getConfigFileUri,
    SamConfig,
    validateSamBuildConfig,
    validateSamDeployConfig,
    validateSamSyncConfig,
    writeSamconfigGlobal,
} from '../../../shared/sam/config'
import assert from 'assert'
import { ToolkitError } from '../../../shared'

import { assertLogsContain } from '../../globalSetup.test'
import { JsonMap } from '@iarna/toml'
import path from 'path'

describe('SamConfig', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
    })
    describe('fromConfigFileUri', () => {
        it('should load the valid config file', async () => {
            const validSamconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', samconfigCompleteData))
            const config = await SamConfig.fromConfigFileUri(validSamconfigFile)
            assert(config instanceof SamConfig)
        })

        it('should throw error when loading invalid config file', async () => {
            const invalidSamconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', samconfigInvalidData))
            try {
                await SamConfig.fromConfigFileUri(invalidSamconfigFile)
                assert.fail('Should have thrown ToolkitError for parsing eror')
            } catch (err) {
                assert(err instanceof ToolkitError)
                assert.strictEqual(err.code, 'samConfigParseError')
            }
        })
    })

    describe('fromProjectRoot', () => {
        it('should load the valid config file', async () => {
            await testFolder.write('samconfig.toml', samconfigCompleteData)
            const config = await SamConfig.fromProjectRoot(projectRoot)
            assert(config instanceof SamConfig)
        })
        it('should throw error when loading invalid config file', async () => {
            await testFolder.write('samconfig.toml', samconfigInvalidData)

            try {
                await SamConfig.fromProjectRoot(projectRoot)
                assert.fail('Should have thrown ToolkitError for parsing eror')
            } catch (err) {
                assert(err instanceof ToolkitError)
                assert.strictEqual(err.code, 'samConfigParseError')
            }
        })

        it('should throw error when (unlikely) no project root found', async () => {
            try {
                await SamConfig.fromProjectRoot(undefined as unknown as vscode.Uri)
                assert.fail('Should have thrown ToolkitError for parsing eror')
            } catch (err) {
                assert(err instanceof ToolkitError)
                assert.strictEqual(err.message, 'No project folder found')
                assert.strictEqual(err.code, 'samNoProjectRootFound')
            }
        })
    })

    describe('getCommandParam', () => {
        let samconfig: SamConfig

        beforeEach(async () => {
            await testFolder.write('samconfig.toml', samconfigCompleteData)
            samconfig = await SamConfig.fromProjectRoot(projectRoot)
        })

        it('should return parameter from primary section if it exists', () => {
            const region = samconfig.getCommandParam('global', 'region')
            const deployChangeSet = samconfig.getCommandParam('deploy', 'confirm_changeset')

            assert.strictEqual(region, 'us-west-2')
            assert.strictEqual(deployChangeSet, false)
        })

        it('should return parameter from global section if primary section does not have it', () => {
            const region = samconfig.getCommandParam('deploy', 'region')
            const stackName = samconfig.getCommandParam('sync', 'stack_name')

            assert.strictEqual(region, 'us-west-2')
            assert.strictEqual(stackName, 'project-1')
        })

        it('should return undefined if parameter is not found in either section', () => {
            // These flags are not expected to be in their respective commands
            const cached = samconfig.getCommandParam('deploy', 'cached')
            const resolveS3 = samconfig.getCommandParam('build', 'resolve_s3')

            assert(!cached)
            assert(!resolveS3)
        })
    })

    describe('listEnvironments', () => {
        let samconfig: SamConfig

        beforeEach(async () => {
            await testFolder.write('samconfig.toml', samconfigCompleteData)
            samconfig = await SamConfig.fromProjectRoot(projectRoot)
        })
        it('should return a list of environments', () => {
            const paramteres = samconfig.listEnvironments()
            assert.strictEqual(paramteres.length, 1)
            const defaultEnvironment = paramteres[0]
            assert.strictEqual(defaultEnvironment.name, 'default')
            assert.deepStrictEqual(defaultEnvironment.commands, {
                build: {
                    parameters: {
                        cached: true,
                        parallel: true,
                        use_container: true,
                    },
                },
                global: {
                    parameters: {
                        stack_name: 'project-1',
                        region: 'us-west-2',
                    },
                },
                deploy: {
                    parameters: {
                        confirm_changeset: false,
                        resolve_s3: true,
                    },
                },
                sync: {
                    parameters: {
                        s3_bucket: 'aws-sam-cli-managed-default-samclisourcebucket-lftqponsaxsr',
                        dependency_layer: false,
                        watch: false,
                    },
                },
            })
        })
    })
})

describe('getConfigFileUri', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
    })

    it('should return uri of a valid if a config file exists in a project root', async () => {
        await testFolder.write('samconfig.toml', samconfigCompleteData)

        const uri = await getConfigFileUri(projectRoot)
        assert(uri instanceof vscode.Uri)
        assert.strictEqual(uri.fsPath, path.join(testFolder.path, 'samconfig.toml'))
    })

    it('should throw error if a config file doesn not exists in a project root', async () => {
        try {
            // No samconfig.toml file created for this test
            await getConfigFileUri(projectRoot)
            assert.fail('Should have thrown ToolkitError eror')
        } catch (err) {
            assert(err instanceof ToolkitError)
            assert.strictEqual(err.code, 'samNoConfigFound')
            assert.strictEqual(err.message, `No samconfig.toml file found in ${projectRoot.fsPath}`)
        }
    })
})

describe('writeSamconfigGlobal', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
    })

    it('should create a new samconfig.toml if not already exist', async () => {
        try {
            await SamConfig.fromProjectRoot(projectRoot)
            assert.fail('Should not have any samconfig.toml in test folder is expected at this point')
        } catch (err) {
            // start writing
            await writeSamconfigGlobal(projectRoot, 'stack-1', 'us-east-1')
            assertLogsContain('No samconfig.toml found, creating...', true, 'warn')
        }

        const samconfig = await SamConfig.fromProjectRoot(projectRoot)
        assert(samconfig instanceof SamConfig)

        const paramteres = samconfig.listEnvironments()
        assert.strictEqual(paramteres.length, 1)

        const defaultEnvironment = paramteres[0]
        assert.strictEqual(defaultEnvironment.name, 'default')
        assert.deepStrictEqual(defaultEnvironment.commands, {
            global: {
                parameters: {
                    stack_name: 'stack-1',
                    region: 'us-east-1',
                },
            },
        })
    })

    it('should edit existing samconfig.toml in global command only', async () => {
        await testFolder.write('samconfig.toml', samconfigCompleteData)
        await writeSamconfigGlobal(projectRoot, 'stack-1', 'us-east-1')

        const samconfig = await SamConfig.fromProjectRoot(projectRoot)
        assert(samconfig instanceof SamConfig)

        const paramteres = samconfig.listEnvironments()
        assert.strictEqual(paramteres.length, 1)

        const defaultEnvironment = paramteres[0]
        assert.strictEqual(defaultEnvironment.name, 'default')
        assert.deepStrictEqual(defaultEnvironment.commands, {
            build: {
                parameters: {
                    cached: true,
                    parallel: true,
                    use_container: true,
                },
            },
            global: {
                parameters: {
                    stack_name: 'stack-1',
                    region: 'us-east-1',
                },
            },
            deploy: {
                parameters: {
                    confirm_changeset: false,
                    resolve_s3: true,
                },
            },
            sync: {
                parameters: {
                    s3_bucket: 'aws-sam-cli-managed-default-samclisourcebucket-lftqponsaxsr',
                    dependency_layer: false,
                    watch: false,
                },
            },
        })
    })

    it('should add global command to existing samconfig.toml', async () => {
        await testFolder.write('samconfig.toml', samconfigCompleteDataWithoutGlobal)
        await writeSamconfigGlobal(projectRoot, 'stack-1', 'us-east-1')

        const samconfig = await SamConfig.fromProjectRoot(projectRoot)
        assert(samconfig instanceof SamConfig)

        const paramteres = samconfig.listEnvironments()
        assert.strictEqual(paramteres.length, 1)

        const defaultEnvironment = paramteres[0]
        assert.strictEqual(defaultEnvironment.name, 'default')
        assert.deepStrictEqual(defaultEnvironment.commands, {
            build: {
                parameters: {
                    cached: true,
                    parallel: true,
                    use_container: true,
                },
            },
            global: {
                parameters: {
                    stack_name: 'stack-1',
                    region: 'us-east-1',
                },
            },
            deploy: {
                parameters: {
                    confirm_changeset: false,
                    resolve_s3: true,
                },
            },
            sync: {
                parameters: {
                    s3_bucket: 'aws-sam-cli-managed-default-samclisourcebucket-lftqponsaxsr',
                    dependency_layer: false,
                    watch: false,
                },
            },
        })
    })
})

describe('createNewConfigFile', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
    })

    it('should create a new samconfig.toml if not already exist', async () => {
        const data = {
            default: {
                global: {
                    parameters: {
                        stack_name: 'stack-1',
                        region: 'us-east-1',
                    },
                },
            },
        } as JsonMap

        await createNewConfigFile(projectRoot, data)

        const samconfig = await SamConfig.fromProjectRoot(projectRoot)
        assert(samconfig instanceof SamConfig)

        const paramteres = samconfig.listEnvironments()
        assert.strictEqual(paramteres.length, 1)

        const defaultEnvironment = paramteres[0]
        assert.strictEqual(defaultEnvironment.name, 'default')
        assert.deepStrictEqual(defaultEnvironment.commands, {
            global: {
                parameters: {
                    stack_name: 'stack-1',
                    region: 'us-east-1',
                },
            },
        })
    })

    it('should create a new samconfig.toml and overwrite existing file', async () => {
        await testFolder.write('samconfig.toml', samconfigCompleteData)

        const data = {
            default: {
                global: {
                    parameters: {
                        stack_name: 'stack-1',
                        region: 'us-east-1',
                    },
                },
            },
        } as JsonMap

        await createNewConfigFile(projectRoot, data)

        const samconfig = await SamConfig.fromProjectRoot(projectRoot)
        assert(samconfig instanceof SamConfig)

        const paramteres = samconfig.listEnvironments()
        assert.strictEqual(paramteres.length, 1)

        const defaultEnvironment = paramteres[0]
        assert.strictEqual(defaultEnvironment.name, 'default')
        assert.deepStrictEqual(defaultEnvironment.commands, {
            global: {
                parameters: {
                    stack_name: 'stack-1',
                    region: 'us-east-1',
                },
            },
        })
    })
})

describe('with valid samconfig', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)

        await testFolder.write('samconfig.toml', samconfigCompleteData)
        await SamConfig.fromProjectRoot(projectRoot)
    })

    it('validateSamDeployConfig should return true', async () => {
        assert(await validateSamDeployConfig(projectRoot))
    })

    it('validateSamSyncConfig should return true', async () => {
        assert(await validateSamSyncConfig(projectRoot))
    })

    it('validateSamBuildConfig should return true', async () => {
        assert(await validateSamBuildConfig(projectRoot))
    })
})

describe('with valid samconfig missing global flag', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)

        await testFolder.write('samconfig.toml', samconfigCompleteDataWithoutGlobal)
    })

    it('validateSamDeployConfig should return false', async () => {
        assert.strictEqual(await validateSamDeployConfig(projectRoot), false)
    })

    it('validateSamSyncConfig should return false', async () => {
        assert.strictEqual(await validateSamSyncConfig(projectRoot), false)
    })

    it('validateSamBuildConfig should return true', async () => {
        assert(await validateSamBuildConfig(projectRoot))
    })
})

describe('with valid samconfig with only global flag', () => {
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)

        await writeSamconfigGlobal(projectRoot, 'stack1', 'us-east-1')
        await SamConfig.fromProjectRoot(projectRoot)
    })

    it('validateSamDeployConfig should return false', async () => {
        assert.strictEqual(await validateSamDeployConfig(projectRoot), false)
    })

    it('validateSamSyncConfig should return false', async () => {
        assert.strictEqual(await validateSamSyncConfig(projectRoot), false)
    })

    it('validateSamBuildConfig should return false', async () => {
        assert.strictEqual(await validateSamBuildConfig(projectRoot), false)
    })
})
