/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import * as os from 'os'
import { transformByQState, JDKVersion } from '../../../../codewhisperer/models/model'
import {
    enterJavaHomeMessage,
    nonWindowsJava11HomeHelpMessage,
    nonWindowsJava8HomeHelpMessage,
    windowsJavaHomeHelpMessage,
} from './stringConstants'

// These enums map to string IDs
export enum ButtonActions {
    STOP_TRANSFORMATION_JOB = 'gumbyStopTransformationJob',
    VIEW_TRANSFORMATION_HUB = 'gumbyViewTransformationHub',
    CONFIRM_TRANSFORMATION_FORM = 'gumbyTransformFormConfirm',
    CANCEL_TRANSFORMATION_FORM = 'gumbyTransformFormCancel',
    CONFIRM_JAVA_HOME_FORM = 'gumbyJavaHomeFormConfirm',
    CANCEL_JAVA_HOME_FORM = 'gumbyJavaHomeFormCancel',
    CONFIRM_START_TRANSFORMATION_FLOW = 'gumbyStartTransformation',
}

export enum GumbyCommands {
    CLEAR_CHAT = 'aws.awsq.clearchat',
    START_TRANSFORMATION_FLOW = 'aws.awsq.transform',
    FOCUS_TRANSFORMATION_HUB = 'aws.amazonq.showTransformationHub',
}

export default class MessengerUtils {
    static createJavaHomePrompt = (): string => {
        let javaHomePrompt = `${enterJavaHomeMessage} ${transformByQState.getSourceJDKVersion()}. \n`
        if (os.platform() === 'win32') {
            javaHomePrompt += windowsJavaHomeHelpMessage.replace(
                'JAVA_VERSION_HERE',
                transformByQState.getSourceJDKVersion()!
            )
        } else {
            const jdkVersion = transformByQState.getSourceJDKVersion()
            if (jdkVersion === JDKVersion.JDK8) {
                javaHomePrompt += ` ${nonWindowsJava8HomeHelpMessage}`
            } else if (jdkVersion === JDKVersion.JDK11) {
                javaHomePrompt += ` ${nonWindowsJava11HomeHelpMessage}`
            }
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
}
