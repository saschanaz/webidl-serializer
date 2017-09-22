export default function (x: { name: string }, y: { name: string }) {
    return x.name.localeCompare(y.name);
}
