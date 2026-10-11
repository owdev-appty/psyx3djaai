# TripNote

旅の準備・行程・予約・お金・持ち物・行った店・学びを、旅ごと・場所ごとにまとめる個人用の PWA。

- 素の HTML / CSS / JavaScript（ES Modules、ビルド不要）
- データは端末の `localStorage` にだけ保存します。このリポジトリに個人データは入れません
- GitHub Pages で公開

## テスト

```
node --test
```

## アイコン

`icons/icon.svg` を元に `tools/make-icons.sh`（macOS）で PNG を作ります。
