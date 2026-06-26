/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { SplashScreenProps } from "./types";
import * as Icons from '../components/Icons';
import { glassStyles } from '../utils/styles';

export const SplashScreen: React.FC<SplashScreenProps> = ({ showIntro, filtersLoaded }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const rafRef    = React.useRef<number>(0);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width  = canvas.offsetWidth  || window.innerWidth;
            canvas.height = canvas.offsetHeight || window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        const stars = Array.from({ length: 110 }, () => ({
            x:     Math.random() * canvas.width,
            y:     Math.random() * canvas.height,
            r:     Math.random() * 1.2 + 0.2,
            o:     Math.random() * 0.35 + 0.08,
            speed: Math.random() * 0.003 + 0.001,
            phase: Math.random() * Math.PI * 2,
        }));

        let t = 0;
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach(s => {
                const opacity = s.o * (0.5 + 0.5 * Math.sin(t * s.speed * 100 + s.phase));
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
                ctx.fill();
            });
            t += 0.016;
            rafRef.current = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener("resize", resizeCanvas);
            cancelAnimationFrame(rafRef.current);
        };
    }, []);

    if (!showIntro) return null;

    return (
        <div style={glassStyles.splashOverlay(filtersLoaded)}>

            <style>{`
                @keyframes mly-globe-spin {
                    from { transform: rotate(0deg);   }
                    to   { transform: rotate(360deg); }
                }
                @keyframes mly-cam-pulse {
                    0%,100% { box-shadow: 0 0 0 4px rgba(55,213,130,0.18), 0 0 20px rgba(55,213,130,0.28); }
                    50%     { box-shadow: 0 0 0 9px rgba(55,213,130,0.07), 0 0 38px rgba(55,213,130,0.52); }
                }
                @keyframes mly-ring {
                    0%   { width:28px; height:28px; opacity:0.65; }
                    100% { width:96px; height:96px; opacity:0;    }
                }
                @keyframes mly-bar {
                    0%   { width:  0%; }
                    25%  { width: 32%; }
                    55%  { width: 61%; }
                    80%  { width: 87%; }
                    100% { width:100%; }
                }
                @keyframes mly-fade-in {
                    from { opacity:0; transform:translateY(8px); }
                    to   { opacity:1; transform:translateY(0);   }
                }
                @keyframes mly-msg-1 {
                    0%,45%   { opacity:1; }
                    50%,100% { opacity:0; }
                }
                @keyframes mly-msg-2 {
                    0%,45%   { opacity:0; }
                    50%,95%  { opacity:1; }
                    100%     { opacity:0; }
                }
            `}</style>

            {/* Star field canvas */}
            <canvas ref={canvasRef} style={glassStyles.splashCanvas} />

            {/* Card */}
            <div style={glassStyles.splashCard}>

                {/* Globe + pin */}
                <div style={glassStyles.splashGlobeWrapper}>

                    {/* Ripple rings */}
                    {[0, 0.85, 1.7].map((delay, i) => (
                        <div key={i} style={{
                            ...glassStyles.splashRippleRing,
                            animation: `mly-ring 2.5s ease-out ${delay}s infinite`,
                        }} />
                    ))}

                    <Icons.WireframeGlobe style={glassStyles.splashGlobe} />

                    {/* Camera pin */}
                    <div style={glassStyles.splashCameraPin}>
                        <img
                            src="https://images2.imgbox.com/8c/de/6JZumb4i_o.jpg"
                            alt="Mapillary"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    </div>
                </div>

                {/* Wordmark */}
                <div style={glassStyles.splashWordmark}>MAPILLARY</div>

                {/* Title */}
                <div style={glassStyles.splashTitle}>Explorer</div>

                {/* Tagline */}
                <div style={glassStyles.splashTagline}>
                    Street-level intelligence at planetary scale
                    <div style={{ fontSize: "8px" }}>Version 4.4.1</div>
                </div>

                {/* Progress track */}
                <div style={glassStyles.splashProgressTrack}>
                    <div style={glassStyles.splashProgressBar} />
                </div>

                {/* Cycling messages */}
                <div style={glassStyles.splashMessageBox}>
                    <div style={glassStyles.splashMessage1}>Initializing coverage layers…</div>
                    <div style={glassStyles.splashMessage2}>Celebrating 3 Billion Images, Powered by You 💚</div>
                </div>

            </div>
        </div>
    );
};