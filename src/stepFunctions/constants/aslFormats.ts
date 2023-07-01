/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const JSON_ASL = 'asl' // eslint-disable-line @typescript-eslint/naming-convention
export const JSON_TYPE = 'json' // eslint-disable-line @typescript-eslint/naming-convention
export const YAML_ASL = 'asl-yaml' // eslint-disable-line @typescript-eslint/naming-convention
export const YAML_TYPE = 'yaml' // eslint-disable-line @typescript-eslint/naming-convention
export const YAML_FORMATS = [YAML_TYPE, YAML_ASL] // eslint-disable-line @typescript-eslint/naming-convention
export const JSON_FORMATS = [JSON_TYPE, JSON_ASL] // eslint-disable-line @typescript-eslint/naming-convention
export const VALID_SFN_PUBLISH_FORMATS = JSON_FORMATS.concat(YAML_FORMATS) // eslint-disable-line @typescript-eslint/naming-convention
export const ASL_FORMATS = [JSON_ASL, YAML_ASL] // eslint-disable-line @typescript-eslint/naming-convention
