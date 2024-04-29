// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

@JsonIgnoreProperties(ignoreUnknown = true)
data class PlanTable(
    @JsonProperty("columnNames")
    val columns: List<String>,
    @JsonProperty("rows")
    val rows: List<PlanTableRow>,
    @JsonProperty("name")
    val name: String,
)
