// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

@JsonIgnoreProperties(ignoreUnknown = true)
data class PlanTableRow(
    @JsonProperty("name")
    val name: String?,
    @JsonProperty("value")
    val value: String?,
    @JsonProperty("dependencyName")
    val dependency: String?,
    @JsonProperty("action")
    val action: String?,
    @JsonProperty("currentVersion")
    val currentVersion: String?,
    @JsonProperty("targetVersion")
    val targetVersion: String?,
    @JsonProperty("apiFullyQualifiedName")
    val deprecatedCode: String?,
    @JsonProperty("numChangedFiles")
    val filesToBeChanged: String?,
    @JsonProperty("relativePath")
    val filePath: String?,
) {
    fun getValueForColumn(col: String): String? =
        when (col) {
            "name" -> name
            "value" -> value
            "dependencyName" -> dependency
            "action" -> action
            "currentVersion" -> currentVersion
            "targetVersion" -> targetVersion
            "apiFullyQualifiedName" -> deprecatedCode
            "numChangedFiles" -> filesToBeChanged
            "relativePath" -> filePath
            else -> "-"
        }
}
