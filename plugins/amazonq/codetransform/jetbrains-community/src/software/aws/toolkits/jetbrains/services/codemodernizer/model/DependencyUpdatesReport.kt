// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlElementWrapper

@JsonIgnoreProperties(ignoreUnknown = true)
data class Dependency(
    val groupId: String? = null,
    val artifactId: String? = null,
    val currentVersion: String? = null,
    @JacksonXmlElementWrapper(localName = "majors")
    val majors: List<String>? = null,
    @JacksonXmlElementWrapper(localName = "minors")
    val minors: List<String>? = null,
    @JacksonXmlElementWrapper(localName = "incrementals")
    val incrementals: List<String>? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DependencyUpdatesReport(
    @JacksonXmlElementWrapper(localName = "dependencies")
    val dependencies: List<Dependency>? = null,
)
