/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IotThingNode } from './explorer/iotThingNode'
import { ExtContext } from '../shared/extensions'
import { IotThingFolderNode } from './explorer/iotThingFolderNode'
import { createThingCommand } from './commands/createThing'
import { deleteThingCommand } from './commands/deleteThing'
import { IotCertificateNode, IotCertWithPoliciesNode, IotThingCertNode } from './explorer/iotCertificateNode'
import { detachThingCertCommand } from './commands/detachCert'
import { IotPolicyCertNode, IotPolicyWithVersionsNode } from './explorer/iotPolicyNode'
import { detachPolicyCommand } from './commands/detachPolicy'
import { deletePolicyCommand } from './commands/deletePolicy'
import {
    activateCertificateCommand,
    deactivateCertificateCommand,
    revokeCertificateCommand,
} from './commands/updateCert'
import { deleteCertCommand } from './commands/deleteCert'
import { IotCertsFolderNode } from './explorer/iotCertFolderNode'
import { createCertificateCommand } from './commands/createCert'
import { attachCertificateCommand } from './commands/attachCertificate'
import { attachPolicyCommand } from './commands/attachPolicy'
import { IotPolicyFolderNode } from './explorer/iotPolicyFolderNode'
import { createPolicyCommand } from './commands/createPolicy'
import { IotNode } from './explorer/iotNodes'
import { copyEndpointCommand } from './commands/copyEndpoint'
import { IotPolicyVersionNode } from './explorer/iotPolicyVersionNode'
import { deletePolicyVersionCommand } from './commands/deletePolicyVersion'
import { setDefaultPolicy } from './commands/setDefaultPolicy'
import { createPolicyVersionCommand } from './commands/createPolicyVersion'
import { editPolicyVersion } from './commands/editPolicy'

/**
 * Activate IoT components.
 */
export async function activate(context: ExtContext): Promise<void> {
    const extensionContext = context.extensionContext

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.iot.createThing', async (node: IotThingFolderNode) => {
            await createThingCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deleteThing', async (node: IotThingNode) => {
            await deleteThingCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.createCert', async (node: IotCertsFolderNode) => {
            await createCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deleteCert', async (node: IotCertWithPoliciesNode) => {
            await deleteCertCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.attachCert', async (node: IotThingNode) => {
            await attachCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.detachCert', async (node: IotThingCertNode) => {
            await detachThingCertCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.createPolicy', async (node: IotPolicyFolderNode) => {
            await createPolicyCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deletePolicy', async (node: IotPolicyWithVersionsNode) => {
            await deletePolicyCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.attachPolicy', async (node: IotCertWithPoliciesNode) => {
            await attachPolicyCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.detachPolicy', async (node: IotPolicyCertNode) => {
            await detachPolicyCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.activateCert', async (node: IotCertificateNode) => {
            await activateCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deactivateCert', async (node: IotCertificateNode) => {
            await deactivateCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.revokeCert', async (node: IotCertificateNode) => {
            await revokeCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.createPolicyVersion', async (node: IotPolicyWithVersionsNode) => {
            await createPolicyVersionCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deletePolicyVersion', async (node: IotPolicyVersionNode) => {
            await deletePolicyVersionCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.setDefaultPolicy', async (node: IotPolicyVersionNode) => {
            await setDefaultPolicy(node)
        }),
        vscode.commands.registerCommand('aws.iot.editPolicyVersion', async (node: IotPolicyVersionNode) => {
            await editPolicyVersion(node)
        }),
        vscode.commands.registerCommand('aws.iot.copyEndpoint', async (node: IotNode) => {
            await copyEndpointCommand(node)
        })
    )
}
