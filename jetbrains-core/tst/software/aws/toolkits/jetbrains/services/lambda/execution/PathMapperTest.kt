// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.openapi.util.io.FileUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.nio.file.Files

class PathMapperTest {
    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private lateinit var mapper: PathMapper

    @Test
    fun firstMatchWinsLocally() {
        initMapper {
            addMapping("local", "remote")
            addMapping("local2", "remote2")
            addMapping("local2", "remote2/sub/")
        }

        createLocalFile("local2/foo")

        assertThat(convertToLocal("remote2/foo")).isEqualTo("local2/foo")
    }

    @Test
    fun firstMatchWinsRemotely() {
        initMapper {
            addMapping("local", "remote")
            addMapping("local2", "remote2")
            addMapping("local2", "remote2/sub/")
        }

        assertThat(mapper.convertToRemote(createLocalFile("local2/foo"))).isEqualTo("remote2/foo")
    }

    @Test
    fun onlyPrefixIsReplaced() {
        initMapper {
            addMapping("local/sub", "remote/sub/sub")
        }

        assertThat(mapper.convertToRemote(createLocalFile("local/sub/foo"))).isEqualTo("remote/sub/sub/foo")
    }

    @Test
    fun matchesAtFolderBoundary() {
        initMapper {
            addMapping("local", "remote")
            addMapping("localFolder", "remote2")
        }

        assertThat(mapper.convertToRemote(createLocalFile("localFolder/foo"))).isEqualTo("remote2/foo")
    }

    @Test
    fun fileMustExistLocally() {
        initMapper {
            addMapping("local1", "remote")
            addMapping("local2", "remote")
        }

        createLocalFile("local2/foo")

        assertThat(convertToLocal("remote/foo")).isEqualTo("local2/foo")
    }

    @Test
    fun trailingSlashIsIgnored() {
        initMapper {
            addMapping("local/", "remote/")
            addMapping("local2", "remote2")
        }

        assertThat(mapper.convertToRemote(createLocalFile("local/foo"))).isEqualTo("remote/foo")
        assertThat(convertToLocal("remote/foo")).isEqualTo("local/foo")

        assertThat(mapper.convertToRemote(createLocalFile("local2/foo"))).isEqualTo("remote2/foo")
        assertThat(convertToLocal("remote2/foo")).isEqualTo("local2/foo")
    }

    @Test
    fun unknownPathsReturnNull() {
        initMapper {
        }

        assertThat(mapper.convertToRemote(createLocalFile("foo"))).isNull()
        assertThat(convertToLocal("foo")).isNull()
    }

    private fun convertToLocal(remote: String) = mapper.convertToLocal(remote)
        ?.removePrefix(FileUtil.normalize(tempFolder.root.absolutePath))
        ?.removePrefix("/")

    private fun createLocalFile(path: String): String {
        val file = tempFolder.root.toPath().resolve(path)
        Files.createDirectories(file.parent)
        if (!Files.exists(file)) {
            Files.createFile(file)
        }

        return file.toString()
    }

    private fun initMapper(init: MutableList<PathMapping>.() -> Unit) {
        val mappings = mutableListOf<PathMapping>()
        mappings.init()
        mapper = PathMapper(mappings)
    }

    private fun MutableList<PathMapping>.addMapping(local: String, remote: String) {
        val file = tempFolder.root.toPath().resolve(local)
        Files.createDirectories(file.parent)
        this.add(PathMapping(file.toString(), remote))
    }
}