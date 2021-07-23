/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Returns the name of a file without an extension
 * @param file File name from which the extension is removed
 * @returns A string file name with the extension removed
 */
export function withoutExtension(file: string) {
    return file.replace(/\.[^/.]+$/, '')
}
