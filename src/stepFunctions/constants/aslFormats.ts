/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const JSON_ASL = 'asl'
export const JSON_TYPE = 'json'
export const YAML_ASL = 'asl-yaml'
export const YAML_TYPE = 'yaml'
export const YAML_FORMATS = [YAML_TYPE, YAML_ASL]
export const JSON_FORMATS = [JSON_TYPE, JSON_ASL]
export const VALID_SFN_PUBLISH_FORMATS = JSON_FORMATS.concat(YAML_FORMATS)
export const ASL_FORMATS = [JSON_ASL, YAML_ASL]
