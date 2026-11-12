use sovra_core::remote_control::{RemoteEndpoint as _, RemoteResponse, ErrorCode, RemoteOperation};
use sovra_mesh::{Reach, RemoteMesh};
use sovra_remote_ffi::{PhoneEndpoint, generate_phone_secret, phone_device_id};

#[tokio::test(flavor = "multi_thread")]
async fn phone_transport_talks_to_desktop_remote_mesh() {
    let desktop = RemoteMesh::bind([7u8; 32], Reach::LocalOnly).await.unwrap();
    let address = serde_json::to_string(&desktop.address()).unwrap();
    let secret = generate_phone_secret();
    let expected_phone = phone_device_id(secret.clone()).unwrap();

    let server = tokio::spawn(async move {
        let handshake = desktop.accept().await.unwrap();
        let connection = handshake.complete().await.unwrap();
        let peer = connection.peer().to_hex();
        let mut ops = Vec::new();
        for _ in 0..2 {
            let incoming = connection.receive().await.unwrap();
            ops.push(incoming.request.operation.clone());
            let reply = match incoming.request.operation {
                RemoteOperation::Hello {} => RemoteResponse::Error { code: ErrorCode::NotPaired, message: "Pair first.".into() },
                _ => RemoteResponse::Result { value: serde_json::json!({"big": "x".repeat(200_000)}) },
            };
            incoming.reply.send(reply).await.unwrap();
        }
        (peer, ops)
    });

    let phone = PhoneEndpoint::bind(secret, true).await.unwrap();
    let connection = phone.connect(address).await.unwrap();
    let hello = connection.request(r#"{"version":1,"operation":{"op":"hello"}}"#.into()).await.unwrap();
    assert!(hello.contains("not_paired"), "{hello}");
    let inspect = r#"{"version":1,"operation":{"op":"control","generation":"0101010101010101010101010101010101010101010101010101010101010101","session":"0303030303030303030303030303030303030303030303030303030303030303","sequence":1,"revision":null,"request":{"action":"inspect"}}}"#;
    let big = connection.request(inspect.into()).await.unwrap();
    assert!(big.len() > 200_000);
    let (peer, ops) = server.await.unwrap();
    assert_eq!(peer, expected_phone, "desktop sees the phone's TLS identity");
    assert!(matches!(ops[1], RemoteOperation::Control { sequence: 1, .. }));
    phone.close().await;
}
