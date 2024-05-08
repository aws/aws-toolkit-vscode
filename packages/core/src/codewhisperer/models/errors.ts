/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../../shared/errors'
/*
create an emum for all error codes

export const enum EnumDe {
    FileSizeExceeded = 'FileSizeExceeded',
    ProjectSizeExceeded = 'ProjectSizeExceeded',
    DefaultError = 'DefaultError',
}
export const mapEnumToString: Record<EnumDe, string> = {
    [EnumDe.FileSizeExceeded]:
        'Amazon Q: The selected file is larger than the allowed size limit. Try again with a smaller file.',
    [EnumDe.ProjectSizeExceeded]:
        'Amazon Q: The selected project is larger than the allowed size limit. Try again with a smaller project.',
    [EnumDe.DefaultError]: 'Amazon Q encountered an error while scanning for security issues. Try again later.',
}
*/
export const mapEnumToString: Record<string, string> = {
    FileSizeExceeded:
        'Amazon Q: The selected file is larger than the allowed size limit. Try again with a smaller file.',
    ProjectSizeExceeded:
        'Amazon Q: The selected project is larger than the allowed size limit. Try again with a smaller project.',
    DefaultError: 'Amazon Q encountered an error while scanning for security issues. Try again later.',
    InvalidSourceZipError: 'Amazon Q encountered an error while scanning for security issues. Try again later.',
}

export class FileSizeExceededError extends ToolkitError {
    constructor() {
        super('Payload size limit reached', {
            code: 'FileSizeExceeded',
        })
    }
}

export class ProjectSizeExceededError extends ToolkitError {
    constructor() {
        super('Payload size limit reached', { code: 'ProjectSizeExceeded' })
    }
}

export class DefaultError extends ToolkitError {
    constructor() {
        super('Security scan failed.', { code: 'DefaultError' })
    }
}

export class InvalidSourceZipError extends ToolkitError {
    constructor() {
        super('Failed to create valid source zip', { code: 'DefaultError' })
    }
}
