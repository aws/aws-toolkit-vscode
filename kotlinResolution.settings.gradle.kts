// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

dependencyResolutionManagement {
    versionCatalogs {
        maybeCreate("libs").apply {
            // pull value from IJ library list: https://github.com/JetBrains/intellij-community/blob/<mv>/.idea/libraries/kotlinx_coroutines_jdk8.xml
            //                              or: https://github.com/JetBrains/intellij-community/blob/<mv>/.idea/libraries/kotlinx_coroutines_core.xml
            val version = when (providers.gradleProperty("ideProfileName").get()) {
                "2022.3" -> {
                    // binary compat issue in tests, but detekt requries at least kotlin 1.8
                    version("kotlin", "1.8.20")
                    "1.6.4"
                }
                "2023.1" -> {
                    "1.6.4"
                }

                "2023.2" -> {
                    "1.7.1"
                }

                "2023.3" -> {
                    "1.7.3"
                }
                else -> { error("not set") }
            }

            version("kotlinxCoroutines", version)
        }
    }
}
