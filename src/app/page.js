import Image from "next/image";
import ElectionResults from "./components/electionResults";

export default function Home() {
  return (
    <>
      <ElectionResults />
      <footer style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", padding: "5px" }}>
        {/* <span style={{ "background-color": "yellow" }}> */}
        <span className="font-semibold text-sm">
          by @davimoura.dev
        </span>
      </footer>
    </>
  );
}
