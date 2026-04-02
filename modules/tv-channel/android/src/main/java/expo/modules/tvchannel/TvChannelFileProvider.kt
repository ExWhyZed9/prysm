package expo.modules.tvchannel

import androidx.core.content.FileProvider

/**
 * Empty subclass — FileProvider is the actual ContentProvider implementation.
 *
 * The manifest declares this class with `android:authorities` set to
 * `${package}.tvchannel.fileprovider` and points to `@xml/tvchannel_file_paths`
 * via the meta-data. FileProvider reads the paths XML and serves files from
 * the cache directory so the TV launcher can read the logo bitmaps.
 */
class TvChannelFileProvider : FileProvider()
