/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable no-restricted-imports */
import { randomUUID } from 'crypto'
import { join } from 'path'
import { promises as fs } from 'fs'
import os from 'os'
import { SageMakerServiceException } from '@amzn/sagemaker-client'
import { open } from './utils'

export enum ExceptionType {
    ACCESS_DENIED = 'AccessDeniedException',
    DEFAULT = 'Default',
    INTERNAL_FAILURE = 'InternalFailure',
    RESOURCE_LIMIT_EXCEEDED = 'ResourceLimitExceeded',
    THROTTLING = 'ThrottlingException',
    VALIDATION = 'ValidationException',
}

export const getVSCodeErrorTitle = (error: SageMakerServiceException): string => {
    const exceptionType = error.name as ExceptionType

    if (exceptionType in ErrorText.StartSession) {
        return ErrorText.StartSession[exceptionType].Title
    }

    return ErrorText.StartSession[ExceptionType.DEFAULT].Title
}

export const getVSCodeErrorText = (error: SageMakerServiceException): string => {
    const exceptionType = error.name as ExceptionType

    switch (exceptionType) {
        case ExceptionType.ACCESS_DENIED:
        case ExceptionType.VALIDATION:
            return ErrorText.StartSession[exceptionType].Text.replace('{message}', error.message)
        case ExceptionType.INTERNAL_FAILURE:
        case ExceptionType.RESOURCE_LIMIT_EXCEEDED:
        case ExceptionType.THROTTLING:
            return ErrorText.StartSession[exceptionType].Text
        default:
            return ErrorText.StartSession[ExceptionType.DEFAULT].Text.replace('{exceptionType}', exceptionType)
    }
}

export const ErrorText = {
    StartSession: {
        [ExceptionType.ACCESS_DENIED]: {
            Title: 'Remote access denied',
            Text: 'Unable to connect because: [{message}]',
        },
        [ExceptionType.DEFAULT]: {
            Title: 'Unexpected system error',
            Text: 'We encountered an unexpected error: [{exceptionType}]. Please contact your administrator and provide them with this error so they can investigate the issue.',
        },
        [ExceptionType.INTERNAL_FAILURE]: {
            Title: 'Failed to connect remotely to VSCode',
            Text: 'Unable to establish remote connection to VSCode. This could be due to several factors. Please try again by clicking the VSCode button. If the problem persists, please contact your admin.',
        },
        [ExceptionType.RESOURCE_LIMIT_EXCEEDED]: {
            Title: 'Connection limit reached',
            Text: 'You have 10 active remote connections to this space. Stop an existing connection to start a new one.',
        },
        [ExceptionType.THROTTLING]: {
            Title: 'Too many connection attempts',
            Text: "You're connecting too quickly. Wait a moment and try again.",
        },
        [ExceptionType.VALIDATION]: {
            Title: 'Configuration error',
            Text: 'The operation cannot be completed due to: [{message}]',
        },
    },
}

export async function openErrorPage(title: string, message: string) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
        body {
            margin: 0;
            padding: 32px 0 0 0;
            background-color: #1e1e2f;
            color: #f1f1f1;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
        }

        .card {
            background-color: #2d2d3c;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 480px;
            width: 90%;
        }

        .error-icon {
            font-size: 25px;
            color: #f44336;
            margin-bottom: 20px;
        }

        .title {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 12px;
        }

        .message {
            font-size: 14px;
            color: #cccccc;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="error-icon">❌</div>
        <div class="title">${title}</div>
        <div class="message">${message}</div>
    </div>
</body>
</html>`

    const filePath = join(os.tmpdir(), `sagemaker-error-${randomUUID()}.html`)
    await fs.writeFile(filePath, html, 'utf8')
    await open(filePath)
}
