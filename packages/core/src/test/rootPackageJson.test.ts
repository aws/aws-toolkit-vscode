/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as semver from 'semver'
import * as path from 'path'
import { fs } from '../shared'

/**
 * Validates the root workspace package.json, in particular the dependency/devDependency
 * version bumps made in this change:
 *   - @typescript-eslint/eslint-plugin & @typescript-eslint/parser -> ^8.56.1
 *   - @vscode/test-electron -> ^2.4.0
 *   - @vscode/test-web -> ^0.0.67
 *   - @vscode/vsce -> ^3.1.0
 *   - eslint-plugin-unicorn -> ^55.0.0
 *   - webpack -> ^5.104.0
 *   - webpack-dev-server -> ^5.2.6
 *   - @aws/language-server-runtimes -> ^0.3.10
 */
describe('root package.json', function () {
    let rootPackageJson: {
        name: string
        version: string
        license: string
        workspaces: string[]
        devDependencies: Record<string, string>
        dependencies: Record<string, string>
    }

    before(async function () {
        const rootPackageJsonPath = path.resolve(__dirname, '../../../../package.json')
        rootPackageJson = JSON.parse(await fs.readFileText(rootPackageJsonPath))
    })

    it('is valid json with the expected top-level fields', function () {
        assert.strictEqual(rootPackageJson.name, 'root')
        assert.ok(Array.isArray(rootPackageJson.workspaces))
        assert.ok(rootPackageJson.workspaces.length > 0)
        assert.strictEqual(rootPackageJson.license, 'Apache-2.0')
    })

    it('does not declare the same package in both dependencies and devDependencies', function () {
        const depNames = Object.keys(rootPackageJson.dependencies)
        const devDepNames = new Set(Object.keys(rootPackageJson.devDependencies))
        const overlap = depNames.filter((name) => devDepNames.has(name))
        assert.deepStrictEqual(overlap, [])
    })

    it('declares only valid semver ranges for every devDependency and dependency', function () {
        const allDeps = { ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies }
        const invalid: string[] = []
        for (const [name, range] of Object.entries(allDeps)) {
            // local file references (e.g. eslint-plugin-aws-toolkits) are not semver ranges.
            if (range.startsWith('file:')) {
                continue
            }
            if (semver.validRange(range) === null) {
                invalid.push(`${name}@${range}`)
            }
        }
        assert.deepStrictEqual(invalid, [], `expected all dependency ranges to be valid semver ranges: ${invalid}`)
    })

    describe('bumped devDependencies', function () {
        const expectedDevDependencyRanges: Record<string, string> = {
            '@typescript-eslint/eslint-plugin': '^8.56.1',
            '@typescript-eslint/parser': '^8.56.1',
            '@vscode/test-electron': '^2.4.0',
            '@vscode/test-web': '^0.0.67',
            '@vscode/vsce': '^3.1.0',
            'eslint-plugin-unicorn': '^55.0.0',
            webpack: '^5.104.0',
            'webpack-dev-server': '^5.2.6',
        }

        for (const [name, expectedRange] of Object.entries(expectedDevDependencyRanges)) {
            it(`pins ${name} to ${expectedRange}`, function () {
                assert.strictEqual(rootPackageJson.devDependencies[name], expectedRange)
            })
        }

        it('keeps @typescript-eslint/eslint-plugin and @typescript-eslint/parser in sync', function () {
            assert.strictEqual(
                rootPackageJson.devDependencies['@typescript-eslint/eslint-plugin'],
                rootPackageJson.devDependencies['@typescript-eslint/parser']
            )
        })
    })

    describe('bumped dependencies', function () {
        it('pins @aws/language-server-runtimes to ^0.3.10', function () {
            assert.strictEqual(rootPackageJson.dependencies['@aws/language-server-runtimes'], '^0.3.10')
        })
    })

    it('did not downgrade any of the bumped packages relative to their previous versions', function () {
        const previousMinVersions: Record<string, string> = {
            '@typescript-eslint/eslint-plugin': '7.14.1',
            '@typescript-eslint/parser': '7.14.1',
            '@vscode/test-electron': '2.3.8',
            '@vscode/test-web': '0.0.65',
            '@vscode/vsce': '2.19.0',
            'eslint-plugin-unicorn': '54.0.0',
            webpack: '5.95.0',
            'webpack-dev-server': '5.2.5',
            '@aws/language-server-runtimes': '0.3.5',
        }

        for (const [name, previousVersion] of Object.entries(previousMinVersions)) {
            const currentRange =
                rootPackageJson.devDependencies[name] !== undefined
                    ? rootPackageJson.devDependencies[name]
                    : rootPackageJson.dependencies[name]
            assert.ok(currentRange, `expected ${name} to still be declared`)
            const minCurrentVersion = semver.minVersion(currentRange)
            assert.ok(minCurrentVersion, `expected ${name}@${currentRange} to resolve to a minimum version`)
            assert.ok(
                semver.gte(minCurrentVersion, previousVersion),
                `expected ${name} minimum version ${minCurrentVersion.version} to be >= previous ${previousVersion}`
            )
        }
    })
})