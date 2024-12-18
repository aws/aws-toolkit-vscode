/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import * as os from 'os'
import { transformByQState, JDKVersion } from '../../../../codewhisperer/models/model'
import * as CodeWhispererConstants from '../../../../codewhisperer/models/constants'
import DependencyVersions from '../../../models/dependencies'

// These enums map to string IDs
export enum ButtonActions {
    STOP_TRANSFORMATION_JOB = 'gumbyStopTransformationJob',
    VIEW_TRANSFORMATION_HUB = 'gumbyViewTransformationHub',
    VIEW_SUMMARY = 'gumbyViewSummary',
    CONFIRM_LANGUAGE_UPGRADE_TRANSFORMATION_FORM = 'gumbyLanguageUpgradeTransformFormConfirm',
    CONFIRM_SQL_CONVERSION_TRANSFORMATION_FORM = 'gumbySQLConversionTransformFormConfirm',
    CANCEL_TRANSFORMATION_FORM = 'gumbyTransformFormCancel', // shared between Language Upgrade & SQL Conversion
    CONFIRM_SKIP_TESTS_FORM = 'gumbyTransformSkipTestsFormConfirm',
    CANCEL_SKIP_TESTS_FORM = 'gumbyTransformSkipTestsFormCancel',
    CONFIRM_SELECTIVE_TRANSFORMATION_FORM = 'gumbyTransformOneOrMultipleDiffsFormConfirm',
    CANCEL_SELECTIVE_TRANSFORMATION_FORM = 'gumbyTransformOneOrMultipleDiffsFormCancel',
    SELECT_SQL_CONVERSION_METADATA_FILE = 'gumbySQLConversionMetadataTransformFormConfirm',
    CONFIRM_DEPENDENCY_FORM = 'gumbyTransformDependencyFormConfirm',
    CANCEL_DEPENDENCY_FORM = 'gumbyTransformDependencyFormCancel',
    CONFIRM_JAVA_HOME_FORM = 'gumbyJavaHomeFormConfirm',
    CANCEL_JAVA_HOME_FORM = 'gumbyJavaHomeFormCancel',
    CONFIRM_START_TRANSFORMATION_FLOW = 'gumbyStartTransformation',
    OPEN_FILE = 'gumbyOpenFile',
    OPEN_BUILD_LOG = 'gumbyOpenBuildLog',
}

export enum GumbyCommands {
    CLEAR_CHAT = 'aws.awsq.clearchat',
    START_TRANSFORMATION_FLOW = 'aws.awsq.transform',
    FOCUS_TRANSFORMATION_HUB = 'aws.amazonq.showTransformationHub',
}

export default class MessengerUtils {
    static createJavaHomePrompt = (): string => {
        let javaHomePrompt = `${
            CodeWhispererConstants.enterJavaHomeChatMessage
        } ${transformByQState.getSourceJDKVersion()}. \n`
        if (os.platform() === 'win32') {
            javaHomePrompt += CodeWhispererConstants.windowsJavaHomeHelpChatMessage
        } else if (os.platform() === 'darwin') {
            const jdkVersion = transformByQState.getSourceJDKVersion()
            if (jdkVersion === JDKVersion.JDK8) {
                javaHomePrompt += ` ${CodeWhispererConstants.macJavaVersionHomeHelpChatMessage(1.8)}`
            } else if (jdkVersion === JDKVersion.JDK11) {
                javaHomePrompt += ` ${CodeWhispererConstants.macJavaVersionHomeHelpChatMessage(11)}`
            } else if (jdkVersion === JDKVersion.JDK17) {
                javaHomePrompt += ` ${CodeWhispererConstants.macJavaVersionHomeHelpChatMessage(17)}`
            }
        } else {
            javaHomePrompt += ` ${CodeWhispererConstants.linuxJavaHomeHelpChatMessage}`
        }
        return javaHomePrompt
    }

    static stringToEnumValue = <T extends { [key: string]: string }, K extends keyof T & string>(
        enumObject: T,
        value: `${T[K]}`
    ): T[K] => {
        if (Object.values(enumObject).includes(value)) {
            return value as unknown as T[K]
        } else {
            throw new Error('Value provided was not found in Enum')
        }
    }

    static createAvailableDependencyVersionString = (versions: DependencyVersions): string => {
        let message = `I found ${versions.length} other dependency versions that are more recent than the dependency in your code that's causing an error: ${versions.currentVersion}.`

        if (versions.majorVersions !== undefined && versions.majorVersions.length > 0) {
            message = message.concat(
                `Latest major version: ${versions.majorVersions[versions.majorVersions.length - 1]} \n`
            )
        }

        if (versions.minorVersions !== undefined && versions.minorVersions.length > 0) {
            message = message.concat(
                `Latest minor version: ${versions.minorVersions[versions.minorVersions.length - 1]} \n`
            )
        }

        return message
    }
}
