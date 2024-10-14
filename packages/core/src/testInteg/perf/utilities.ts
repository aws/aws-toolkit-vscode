/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import { FileSystem } from '../../shared/fs/fs'
import AdmZip from 'adm-zip'

/**
 * Provide an upper bound on total number of system calls done through our fs module.
 * @param fsSpy filesystem spy (Ex. `sinon.spy(fs)`)
 * @returns count of operations
 */
export function getFsCallsUpperBound(fsSpy: sinon.SinonSpiedInstance<FileSystem>): number {
    return getFsReadsUpperBound(fsSpy) + getFsWritesUpperBound(fsSpy)
}

/**
 * Provide an upper bound on the number of filesystem reads done through our fs module.
 * This is an upper bound because some of the functions call eachother.
 * @param fsSpy filesystem spy (Ex. `sinon.spy(fs)`)
 * @returns value
 */
export function getFsReadsUpperBound(fsSpy: sinon.SinonSpiedInstance<FileSystem>): number {
    return (
        fsSpy.readFileBytes.callCount +
        fsSpy.exists.callCount +
        fsSpy.exists.callCount +
        fsSpy.readdir.callCount +
        fsSpy.copy.callCount +
        fsSpy.checkPerms.callCount +
        fsSpy.tryGetFilepathEnvVar.callCount
    )
}
/**
 * Provide an upper bound on the number of filesystem writes done through our fs module.
 * This is an upper bound because some of the functions call eachother.
 * @param fsSpy filesystem spy (Ex. `sinon.spy(fs)`)
 * @returns value
 */
export function getFsWritesUpperBound(fsSpy: sinon.SinonSpiedInstance<FileSystem>): number {
    return (
        fsSpy.writeFile.callCount +
        fsSpy.mkdir.callCount +
        fsSpy.rename.callCount +
        fsSpy.chmod.callCount +
        fsSpy.delete.callCount +
        fsSpy.copy.callCount
    )
}
/**
 * Check that each file is added to zip once, and written to buffer done exactly once.
 * @param zipSpy spied AdmZip instance used by code.
 * @param numFiles number of files in the workspace expected to be zipped.
 */
export function assertEfficientZip(zipSpy: sinon.SinonSpiedInstance<AdmZip>, numFiles: number): void | never {
    assert.ok(zipSpy.addLocalFile.callCount <= numFiles, 'add files to zip at most once')
    assert.strictEqual(zipSpy.toBuffer.callCount, 1, 'creates buffer once')
}
