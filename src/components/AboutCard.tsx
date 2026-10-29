import dawnLogo from "../../assets/brand/second-dawn-main.png";
import pkg from "../../package.json";
import owlIcon from "../assets/owl-l.png";
import { useT } from "../i18n";

export function AboutCard() {
  const { t } = useT();
  return (
    <>
      <div className="about">
        <img src={owlIcon} alt="" width={56} height={56} />
        <div>
          <strong>Owl-L</strong>
          <div className="dw-row__desc">{t("about.tagline")}</div>
          <div className="dw-row__desc">{t("about.version", { version: pkg.version })}</div>
        </div>
        <div className="about__dawn">
          <span>{t("about.partOf")}</span>
          <img src={dawnLogo} alt="Second Dawn" height={36} />
        </div>
      </div>
      <div className="dw-row">
        <span className="dw-row__desc">{t("about.license")}</span>
      </div>
      <div className="dw-row">
        <span className="dw-row__desc">{t("about.credits")}</span>
      </div>
    </>
  );
}
