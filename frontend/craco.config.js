const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Добавляем полифиллы
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "process": require.resolve("process/browser.js"),
        "stream": require.resolve("stream-browserify"),
        "util": require.resolve("util/"),
        "buffer": require.resolve("buffer/"),
        "assert": require.resolve("assert"),
        "fs": false
      };

      // Оптимизация для production
      if (process.env.NODE_ENV === 'production') {
        // Включаем tree shaking и оптимизацию
        webpackConfig.optimization = {
          ...webpackConfig.optimization,
          usedExports: true,
          sideEffects: true,
          minimize: true,
          splitChunks: {
            chunks: 'all',
            maxInitialRequests: Infinity,
            minSize: 20000,
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name(module) {
                  const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
                  return `vendor.${packageName.replace('@', '')}`;
                },
                priority: 20
              },
              common: {
                minChunks: 2,
                priority: 10,
                reuseExistingChunk: true
              }
            }
          },
          minimizer: [
            new TerserPlugin({
              terserOptions: {
                parse: {
                  ecma: 8,
                },
                compress: {
                  ecma: 5,
                  warnings: false,
                  comparisons: false,
                  inline: 2,
                  drop_console: true,
                  drop_debugger: true,
                  pure_funcs: ['console.log', 'console.info', 'console.debug']
                },
                mangle: {
                  safari10: true,
                },
                output: {
                  ecma: 5,
                  comments: false,
                  ascii_only: true,
                },
              },
              parallel: true,
            })
          ]
        };

        // Добавляем сжатие gzip и brotli
        webpackConfig.plugins.push(
          new CompressionPlugin({
            filename: '[path][base].gz',
            algorithm: 'gzip',
            test: /\.(js|css|html|svg)$/,
            threshold: 10240,
            minRatio: 0.8,
            deleteOriginalAssets: false
          }),
          new CompressionPlugin({
            filename: '[path][base].br',
            algorithm: 'brotliCompress',
            test: /\.(js|css|html|svg)$/,
            threshold: 10240,
            minRatio: 0.8,
            deleteOriginalAssets: false
          })
        );

        // Оптимизация для Monaco Editor
        webpackConfig.plugins.push(
          new MonacoWebpackPlugin({
            languages: ['cpp', 'javascript', 'json'],
            features: ['!gotoSymbol', '!quickOutline', '!format', '!hover'],
            filename: 'static/js/[name].worker.js'
          })
        );

        // Анализ бандла (опционально, раскомментируйте для анализа)
        // webpackConfig.plugins.push(
        //   new BundleAnalyzerPlugin({
        //     analyzerMode: 'static',
        //     reportFilename: 'bundle-report.html'
        //   })
        // );
      }

      // Находим правило для CSS файлов
      const cssRule = webpackConfig.module.rules
        .find(rule => rule.oneOf)
        .oneOf.find(
          rule => rule.test && rule.test.toString().includes('css')
        );

      // Добавляем исключение для CSS файлов Monaco Editor
      if (cssRule) {
        const monacoExclude = /monaco-editor[\\/]esm[\\/]vs[\\/].*\.css$/;
        if (Array.isArray(cssRule.exclude)) {
          cssRule.exclude.push(monacoExclude);
        } else if (cssRule.exclude instanceof RegExp) {
          cssRule.exclude = [cssRule.exclude, monacoExclude];
        } else {
          cssRule.exclude = [monacoExclude];
        }
      }

      // Добавляем новое правило специально для CSS файлов Monaco Editor
      webpackConfig.module.rules.push({
        test: /monaco-editor[\\/]esm[\\/]vs[\\/].*\.css$/,
        use: ['style-loader', 'css-loader'],
      });

      // Добавляем плагины
      webpackConfig.plugins = [
        ...webpackConfig.plugins,
        new webpack.ProvidePlugin({
          process: 'process/browser.js',
          Buffer: ['buffer', 'Buffer'],
        }),
        new MiniCssExtractPlugin({
          filename: 'static/css/[name].[contenthash:8].css',
          chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
        }),
        // Оптимизация для MUI
        new webpack.optimize.LimitChunkCountPlugin({
          maxChunks: 5
        }),
        // Определяем глобальные переменные
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
          'process.env.BROWSER': true
        })
      ];

      return webpackConfig;
    }
  }
}; 