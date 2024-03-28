// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.profiles.Profile
import software.aws.toolkits.core.utils.test.aString

fun profile(name: String = aString(), properties: MutableMap<String, String>.() -> Unit = {}): Profile = Profile.builder()
    .name(name)
    .properties(mutableMapOf<String, String>().apply { properties(this) })
    .build()
