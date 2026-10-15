import AuthForm from "../auth-form";
export default function LoginPage() {
 return <AuthForm sitesAvailable={process.env.INEXT_VERCEL_RUNTIME !== "1" && process.env.VERCEL !== "1"}/>;
}
