// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog

import java.nio.file.Path

class GithubWriter(private val file: Path, repoUrl: String?) : ChangeLogWriter(repoUrl) {
    private val writer = file.toFile().bufferedWriter()

    override fun append(entry: String) {
        writer.write(entry)
    }

    override fun close() {
        writer.close()
    }

    override fun toString(): String = "GithubWriter(file=$file)"
}
