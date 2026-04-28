import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-page-custom-font": "off",
    },
  },
];

export default eslintConfig;
