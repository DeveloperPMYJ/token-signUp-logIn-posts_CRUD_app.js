require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { DataSource } = require("typeorm");

const myDataSource = new DataSource({
  type: process.env.DB_CONNECTION,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  try {
    return res.status(200).json({ message: "Welcome to Team6's server!" });
  } catch (err) {
    console.log(err);
  }
});

app.get("/users", async (req, res) => {
  try {
    const userData = await myDataSource.query(
      "SELECT id, nickname, email FROM USERS "
    );

    console.log("USER DATA:", userData);

    return res.status(200).json({
      users: userData,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: error.message,
    });
  }
});

// 회원가입
app.post("/users", async (req, res) => {
  try {
    console.log(req.body); //통신 때 body 찍어보기 위해

    const { password, email, nickname } = req.body;

    // key error
    if (!email || !password || !nickname) {
      const error = new Error("KEY_ERROR");
      error.statusCode = 400;
      throw error;
    }

    // 이메일 중복 확인
    const existingUser = await myDataSource.query(`
      SELECT id, email FROM users WHERE email='${email}';   
      `);
    console.log("existing user:", existingUser);

    if (existingUser.length > 0) {
      const error = new Error("DUPLICATED_EMAIL_ADDRESS");
      error.statusCode = 400;
      throw error;
    }

    // 이메일 . @ 필수 (특수문자 사용 - 정규화)
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    if (!email.match(emailRegex)) {
      const error = new Error("유효하지 않은 이메일 주소 형식입니다");
      error.statusCode = 400;
      throw error;
    }

    // 비밀번호 길이 제한
    if (password.length < 10) {
      const error = new Error("INVALID_PASSWORD, longer than 10 characters");
      error.statusCode = 400;
      throw error;
    }

    // DB에 유저 정보 저장 전, 비밀번호 해쉬화
    const saltRounds = 10;
    const hashedPw = await bcrypt.hash(password, saltRounds);

    // Database에 회원가입 성공한 유저 정보 저장
    await myDataSource.query(`
        INSERT INTO users (                    
        email, 
        password,
        nickname
        )
        VALUES (
        '${email}',
        '${hashedPw}',
        '${nickname}'
        )
    `);

    // 회원가입 성공 or 실패 메세지 프론트에 전달
    return res.status(201).json({
      message: "userCreated 회원가입 완료",
    });
  } catch (error) {
    console.log(error);
    return res.status(error.statusCode).json({
      message: "failed 회원가입에 실패하였습니다",
    });
  }
});
// 위에서 던진 try 안에 if 문 true면 return 201, false면 catch error로

// 로그인
app.post("/logIn", async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;

    // Key error
    if (email === undefined || password === undefined) {
      const error = new Error("KEY_ERROR");
      error.statusCode = 400;
      throw error;
    }

    const existingUser = await myDataSource.query(`
    SELECT id, email, password FROM users WHERE email='${email}';
    `);
    console.log("existing user:", existingUser);

    if (existingUser.length === 0) {
      const error = new Error("EMAIL_Unexist");
      error.statusCode = 400;
      throw error;
    }

    console.log("existing user:", existingUser);
    console.log("email", "password");

    console.log(password);

    //if (password !== existingUser[0].password) {
    //  const error = new Error("INVALID_PASSWORD");
    //  error.statusCode = 400;
    //  throw error;
    // }

    // 해당 email의 해쉬된 패스워드가 DB에 있는가
    const hashPw = await bcrypt.compare(password, existingUser[0].password);
    console.log(hashPw);

    if (!hashPw) {
      const error = new Error("passwordError");
      error.statusCode = 400;
      error.code = "passwordError";
      throw error;
    } // 보안을 위해 비밀번호, 패스워드 중 오류 알려주지 않기로

    // 로그인 성공 시 토큰 발급 -> jwt.sign함수
    const token = jwt.sign({ id: existingUser[0].id }, process.env.TYPEORM_JWT);
    return res.status(200).json({
      message: "LOGIN_SUCCESS 로그인 성공하였습니다",
      accessToken: token,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json(error);
  }
});

// 서버 구동
const server = http.createServer(app);
require("dotenv").config();
const portNumber = process.env.PORT || 8000;

const start = async () => {
  try {
    server.listen(portNumber);
    console.log(`Server is listening on ${portNumber}`);
  } catch (err) {
    console.error(err);
  }
};

start();

myDataSource.initialize().then(() => {
  console.log("Data Source has been initialized!");
});

//게시물 생성 Create
app.post("/createpost", async (req, res) => {
  try {
    console.log(1);
    // 1. 회원만 게시물 작성 가능 (header에서 '토큰 있는지 확인'=req.headers.authorization)
    const token = req.headers.authorization;
    console.log("토큰: ", token);
    if (!token) {
      const error = new Error("TOKEN_ERROR 게시물 작성 권한이 없습니다");
      error.statusCode = 400;
      error.code = "TOKEN_ERROR";
      throw error;
    }

    console.log(token);

    // 2. '가진 토큰 검증'= jwt.verify함수:  첫 인자 token, 두번째 인자 토큰 검증 시크릿키 -> 검증 성공 시 토큰 해독한 내용 return -> 값을 변수 id에 할당

    const { id } = jwt.verify(token, process.env.TYPEORM_JWT);
    // const userData = jwt.verify(....);
    // const id = userData.id
    console.log(id);

    if (!id) {
      const error = new Error ("verify_token_ERROR 게시물 작성 권한이 없습니다");
      error.statusCode = 400;
      error.code = "verify_token_ERROR";
      throw error;
    }

    const { content } = req.body;
    //const { id } = req.body // token 있으면 이 줄은 필요 없음

    if (content.length === 0) {
      const error = new Error("CONTENT_TOO_SHORT 1글자 이상 적어주세요");
      error.status = 400;
      error.code = "CONTENT_TOO_SHORT";
      throw error;
    } //메세지 기니까, 팀원들끼리 코드 분리 시 따로 써주는

    // 4. 게시물 내용 DB에 저장 // token 있어도 id 받아야 하는 이유 -> id 안 받는 건, req에서이고, 이건 DB에 데이터 저장하는 거니까
    const newPost = await myDataSource.query(`
      INSERT INTO threads (
        user_id, 
        content
      )
      VALUES (
        '${id}',
        '${content}'
      )
    `);
    console.log (newPost);

    // 5. 성공 시 반환
    return res.status(200).json({ message: "POST CREATED 게시물 생성 완료" });
  } catch (error){
    console.error('JWT verification failed:', err.message);
    console.log(error); // if 에서 fasle면 throw error- catch error
    return res.status(400).json({ message: "FAILED" });
  }
});

//게시물 목록 조회 Read
app.get("/readpost", async (req, res) => {
  try {
    console.log(req.body); //req 변수 사용해주기 위해 (회색표시)

    const { postId } = req.body;

    const getPost = await myDataSource.query(`
    SELECT
     *
    FROM 
      threads 
    WHERE threads.id = ${postId}`); // 기획하는대로, 내가 쿼리문에 조건을 더 달아주면 됨 (추가 조건)

    console.log(getPost);

    return res.status(200).json({ message: "POST LIST 게시물 목록 조회" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "FAILED" });
  }
}); //* code 성공, error.code 실패 or message:성공, message:실패
// image 가져올 때 user id

//게시물 삭제 Delete (create랑 비슷한 로직)
app.delete("/deletepost", async (req, res) => {
  try {
    console.log(1);
    //1. 토큰 검증 (회원인지):  회원만 게시물 작성 가능 (header에서 '토큰 확인'=req.headers.authorization)
    const token = req.headers.authorization;

    if (!token) {
      const error = new Error("TOKEN_ERROR 게시물 삭제 권한이 없습니다");
      error.statusCode = 400;
      error.code = "TOKEN_ERROR";
      throw error;
    }
    console.log(token);

    //2. '토큰 검증'= jwt.verify함수: 첫 인자 token, 두번째 인자 토큰 검증 시크릿키 -> 검증 성공 시 토큰 해독한 내용 return -> 값을 변수 id에 할당
    const { id } = jwt.verify(token, process.env.TYPEORM_JWT);
    // 여기 id는 토큰에 담긴 Id
    //token변수 선언된 'req.headers.authorization의 id를 가져온다.
    console.log(id);

    if (!id) {
      const error = new Error ("verify_token_ERROR 게시물 작성 권한이 없습니다");
      error.statusCode = 400;
      error.code = "verify_token_ERROR";
      throw error;
    }

  //const { userId } = req.body;  -> token 있으면 req에서 받을 필요 없음 
    const { threadsId } = req.body;
    //회색으로 뜨는 건, 변수 사용이 안 돼서, 아래에서 쓰이지 않아서 -> console.log만 찍어도 흰색 됨

    //* user id, post id, createddate select from DB
    const deletePost = await myDataSource.query(` 
      DELETE FROM
        threads
      WHERE 
      user_id=${id} and threads.id= ${threadsId}
      `); //* threads 중에 어떤 user의 어떤 포스트 (이것만 하면 되니, 칼럼이름 표시 안 해도 됨)
    
    console.log(deletePost); //deltePost 변수 사용해주기 위해 (회색표시 -> 흰색)
    return res.status(200).json({ message: "DELETE POST 게시물 삭제" });
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    console.log(error);
    return res.status(400).json({ message: "FAILED" });
    //* return res.status(400).json(error);  -> 메세지 매번 던지기 힘드니, error라는 공용함수 사용 시
  }
});

//게시물 수정 Update
app.put("/updatepost", async (req, res) => {
  try {
    console.log(1)
    // 1. 토큰 확인, 검증 (회원인지) : 회원만 게시물 작성 가능 (header에서 '토큰 확인'=req.headers.authorization)
    const token = req.headers.authorization;
    console.log("토큰: ", token);
    if (!token) {
      const error = new Error("TOKEN_ERROR 게시물 수정 권한이 없습니다");
      error.statusCode = 400;
      error.code = "TOKEN_ERROR";
    throw error;
    }
    console.log(token);

    //2. '토큰 검증'= jwt.verify함수 : 첫 인자 token, 두번째 인자 토큰 검증 시크릿키 -> 검증 성공 시 토큰 해독한 내용 return -> 값을 변수 id에 할당
    const { id } = jwt.verify(token, process.env.TYPEORM_JWT);
    // token 안의 id
    //token변수 선언된 'req.headers.authorization의 id를 가져온다.
    console.log(id);

    if (!id) {
      const error = new Error ("verify_token_ERROR 게시물 작성 권한이 없습니다");
      error.statusCode = 400;
      error.code = "verify_token_ERROR";
    throw error;
    }

  //const { userId } = req.body;  -> token 있으면 userId 필요 없음 
    const { threadsId } = req.body;
    const { newContent } = req.body;

  //console.log(userId);
    console.log(threadsId); //content 변수 사용해주기 위해 (회색표시 -> 흰색)

    const updatingPostData = await myDataSource.query(`
    UPDATE threads 
    SET 
      content = '${newContent}', updated_at = NOW ()
    WHERE user_id= ${id} AND threads.id=${threadsId};
  `);

    console.log("updatingPostData:", updatingPostData);

    if (updatingPostData.length === 0) {
      const error = new Error("수정 권한이 없습니다");
      error.statusCode = 400;
    throw error;
    }

    console.log(updatingPostData);

    return res.status(200).json({ message: "POST UPDATED 수정 완료" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "게시물 수정이 되지 않았습니다" });
  }
});
