/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { glassStyles } from "../utils/styles";
import { SplashScreenProps } from "./types";

/**
    * SplashScreen
    * Intro overlay shown while filter options are loading.
    * Fades/zooms out once `filtersLoaded` becomes true.
*/
export const SplashScreen: React.FC<SplashScreenProps> = ({ showIntro, filtersLoaded }) => {
    if (!showIntro) return null;
    return (
        <div style={{
            ...glassStyles.splashContainer,
            opacity: filtersLoaded ? 0 : 1,
            transform: filtersLoaded ? "scale(1.1)" : "scale(1)"
        }}>
            <div style={glassStyles.splashCard}>

                {/* LOGO AREA WITH SONAR RIPPLES */}
                <div style={glassStyles.logoWrapper}>
                    <div style={glassStyles.splashRipple} />
                    <div style={{ ...glassStyles.splashRipple, animationDelay: "1s" }} />
                    <img
                        className="splash-screen-logo"
                        src="https://images2.imgbox.com/ec/73/iwr0gH9D_o.gif"
                        alt="Logo"
                        style={glassStyles.splashLogo}
                    />
                </div>

                {/* SHIMMERING TITLE */}
                <div className="splash-screen-text" style={glassStyles.splashTitle}>
                    MAPILLARY Explorer
                </div>

                {/* GLOWING PROGRESS BAR */}
                <div style={glassStyles.progressTrack}>
                    <div style={glassStyles.progressBar} />
                </div>

                {/* ANIMATED MESSAGES */}
                <div style={{ position: "relative", height: "14px", marginTop: "8px", width: "100%" }}>
                    <div className="splash-msg-1" style={{
                        fontSize: "10px", color: "rgba(255,255,255,0.5)", fontStyle: "italic",
                        position: "absolute", width: "100%", textAlign: "center"
                    }}>
                        Initializing...
                    </div>
                    <div className="splash-msg-2" style={{
                        fontSize: "10px", color: "#37d582", fontWeight: 600, letterSpacing: "0.2px",
                        position: "absolute", width: "100%", textAlign: "center"
                    }}>
                        Celebrating 3 Billion Images, Powered by You 💚
                    </div>
                </div>
            </div>
        </div>
    );
};
