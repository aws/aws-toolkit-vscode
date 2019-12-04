// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import java.nio.file.Path

class GithubWriter(private val file: Path, issueUrl: String? = null) : ChangeLogWriter(issueUrl) {
    private val writer = file.toFile().bufferedWriter()

    override fun append(line: String) {
        writer.write(line)
    }

    override fun close() {
        writer.close()
    }

    override fun toString(): String = "GithubWriter(file=$file)"
}
