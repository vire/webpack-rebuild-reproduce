/* eslint-disable @typescript-eslint/no-var-requires */

// TODO: We want to move all the properties which are in both `production` and
// `development` object into the `common` object. Because it's a huge mess right now.
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const path = require("path");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const AssetsPlugin = require("assets-webpack-plugin");
const { RelativeCiAgentWebpackPlugin } = require("@relative-ci/agent");
const SpeedMeasurePlugin = require("speed-measure-webpack-plugin");
const smp = new SpeedMeasurePlugin();

const common = {
  node: {
    global: true,
  },
  plugins: [],
  entry: {
    simple: ["./client/simple.entry.tsx"],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".css"],
    fallback: {
      buffer: require.resolve("buffer"),
      path: require.resolve("path-browserify"),
    },
  },
  performance: {
    maxAssetSize: 3000000,
    maxEntrypointSize: 3500000,
  },
  module: {
    rules: [
      {
        // eslint-disable-next-line security/detect-unsafe-regex
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        type: "asset/resource",
        generator: {
          filename: "fonts/[name].[ext]",
        },
      },
    ],
  },
};

const production = {
  ...common,
  mode: "production",
  devtool: "source-map", // We tried cheap-source-map before, but it broke sentry source maps
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
    chunkIds: "named",
    splitChunks: {
      chunks: "all",
      minSize: 1000 * 400,
      cacheGroups: {
        // This prevents creating 70+ different chunks for each monaco
        // feature/language. This produces one 3.6MB+ chunk.
        monacoCommon: {
          test: /[\\/]node_modules[\\/]monaco-editor/,
          // NOTE: After upgrading monaco, the v2 here needs to be bumped.
          //   Monaco CSS chunk does not add contenthash and needs cache refresh.
          name: "monaco-editor-common-v2",
          chunks: "async",
        },
      },
    },
  },
  output: {
    path: path.resolve(__dirname, "./dist/static/dist"),
    filename: "[name].bundle.[contenthash:8].js",
    chunkFilename: "[name].chunk.[contenthash:8].js",
    publicPath: "/static/dist/",
  },
  plugins: [
    ...common.plugins,
    // create manifest only for `production` build / in `dev` there is only single bundle
    new AssetsPlugin({
      entrypoints: true,
      filename: "assets.json",
      path: path.join(__dirname, "dist", "server"),
    }),
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash:8].css",
    }),
    new RelativeCiAgentWebpackPlugin({
      enabled: process.env.CI,
    }),
  ].filter(Boolean),
  module: {
    rules: [
      ...common.module.rules,
      {
        test: /(\.css)$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules|\.stories\.tsx/,
        use: [
          {
            loader: "babel-loader",
            options: {
              cacheDirectory: true,
              babelrc: false,
              presets: [
                "@babel/preset-typescript",
                "@babel/react",
                require.resolve("@emotion/babel-preset-css-prop"),
              ],
              plugins: [
                "@babel/plugin-proposal-class-properties",
                "@babel/plugin-proposal-object-rest-spread",
                "@babel/plugin-syntax-dynamic-import",
                "@babel/plugin-proposal-optional-chaining",
                "@babel/plugin-proposal-nullish-coalescing-operator",
                [
                  "prismjs",
                  {
                    languages: ["python", "sql"],
                  },
                ],
              ],
            },
          },
        ],
      },
    ],
  },
};

/**
 *
 * @param {boolean} enableDevServer
 * @param {"development" | "production"} mode
 * @returns
 */
const development = (enableDevServer, mode) => {
  if (enableDevServer) {
    console.log("Using dev server plugins.");
  }

  return {
    ...common,
    cache: {
      type: "filesystem",
    },
    mode,
    target: "web",
    devtool: "eval-source-map",
    output: {
      path: path.resolve(__dirname, "static", "dist"),
      filename: "[name].bundle.js",
      chunkFilename: "[name].chunk.js",
      publicPath: "/static/dist/",
      clean: true,
    },
    plugins: [
      ...common.plugins,
      new ReactRefreshWebpackPlugin(),
      new webpack.EnvironmentPlugin({
        NODE_ENV: mode,
      }),
    ].filter(Boolean),
    devServer: {
      port: 3010,
      allowedHosts: "all",
      hot: true,
      host: "0.0.0.0",
    },
    module: {
      rules: [
        ...common.module.rules,
        {
          // eslint-disable-next-line security/detect-unsafe-regex
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          type: "asset/resource",
          generator: {
            filename: "fonts/[name].[ext]",
          },
        },
        {
          test: /(\.css)$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.tsx?$/,
          loader: "esbuild-loader",
          options: {
            loader: "tsx", // Or 'ts' if you don't need tsx
            target: "es2017",
            jsxFactory: "jsx",
            banner: "var jsx = require('@emotion/react').jsx",
          },
        },
      ],
    },
  };
};

const exportFn = (env, argv) =>
  argv.mode === "production"
    ? production
    : smp.wrap(development(process.env.ENABLE_DEV_SERVER, argv.mode));

module.exports = exportFn;
