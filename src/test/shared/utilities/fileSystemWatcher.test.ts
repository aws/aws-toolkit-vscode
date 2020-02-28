/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { rmrf } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { associateFileSystemWatcherWithListener, FileWatcherListener } from '../../../shared/utilities/fileSystemWatcher'

class FakeListener implements FileWatcherListener {
    public constructor() {}
    public async onListenedChange(uri: vscode.Uri) {}
    public async onListenedCreate(uri: vscode.Uri) {}
    public async onListenedDelete(uri: vscode.Uri) {}
    public dispose() {}
}

interface FakeWatcherAddons extends vscode.FileSystemWatcher {
    triggerChange(uri: vscode.Uri): void
    triggerCreate(uri: vscode.Uri): void
    triggerDelete(uri: vscode.Uri): void
}

class FakeWatcher implements FakeWatcherAddons {
    public ignoreCreateEvents: boolean = false
    public ignoreChangeEvents: boolean = false
    public ignoreDeleteEvents: boolean = false
    private readonly _onDidCreate = new vscode.EventEmitter<vscode.Uri>()
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    private readonly _onDidDelete = new vscode.EventEmitter<vscode.Uri>()
    public constructor() {}
    public dispose() {}
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }
    public get onDidCreate(): vscode.Event<vscode.Uri> {
        return this._onDidCreate.event
    }
    public get onDidDelete(): vscode.Event<vscode.Uri> {
        return this._onDidDelete.event
    }
    public triggerChange(uri: vscode.Uri) {
        this._onDidChange.fire(uri)
    }
    public triggerCreate(uri: vscode.Uri) {
        this._onDidCreate.fire(uri)
    }
    public triggerDelete(uri: vscode.Uri) {
        this._onDidDelete.fire(uri)
    }
}

describe('FileSystemWatcher', async () => {
    let tempFolder: string
    let sandbox: sinon.SinonSandbox
    let listener: FileWatcherListener
    let watcher: FakeWatcherAddons

    let changeStub: sinon.SinonStub<[vscode.Uri], Promise<void>>
    let createStub: sinon.SinonStub<[vscode.Uri], Promise<void>>
    let deleteStub: sinon.SinonStub<[vscode.Uri], Promise<void>>
    const globPattern = '**/*'
    const uri = vscode.Uri.parse('asdf/asdf')

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        listener = new FakeListener()
        watcher = new FakeWatcher()
        sandbox = sinon.createSandbox()
        changeStub = sandbox.stub(listener, 'onListenedChange')
        createStub = sandbox.stub(listener, 'onListenedCreate')
        deleteStub = sandbox.stub(listener, 'onListenedDelete')
    })

    afterEach(async () => {
        await rmrf(tempFolder)
        sandbox.restore()
    })

    it('listens to change events', async () => {
        associateFileSystemWatcherWithListener(watcher, listener, globPattern)
        watcher.triggerChange(uri)
        assert.ok(changeStub.calledOnce)
        assert.ok(changeStub.withArgs(uri))
    })

    it('listens to create events', async () => {
        associateFileSystemWatcherWithListener(watcher, listener, globPattern)
        watcher.triggerCreate(uri)
        assert.ok(createStub.calledOnce)
        assert.ok(createStub.withArgs(uri))
    })

    it('listens to delete events', async () => {
        associateFileSystemWatcherWithListener(watcher, listener, globPattern)
        watcher.triggerDelete(uri)
        assert.ok(deleteStub.calledOnce)
        assert.ok(deleteStub.withArgs(uri))
    })
})
