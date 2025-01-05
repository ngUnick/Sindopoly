import { Button, Checkbox, Form, Input, Tooltip } from 'antd';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { GameAPI } from '../../apis/GameAPI';
import { useNavigate } from 'react-router-dom';

function CreateGame() {
    const navigate = useNavigate();

    const onFinish = async (values) => {
        console.log('Success:', values);
        try {
            const response = await GameAPI.createGame(values.MaxTime, values.MaxMoney);
            navigate(`/lobby?creator=1&game_id=${response["game_id"]}`);
            
        } catch (error) {
            
        }
  };

    const onFinishFailed = (errorInfo) => {
      console.log('Failed:', errorInfo);
  };

  return (
    <div className="flex-grow flex justify-center items-center bg-pic bg-cover bg-no-repeat">
      {/* Vignette */}
      <div className="fixed w-full h-full shadow-[0_0_80px_rgba(255,255,255,0.7)_inset] left-0 top-0"></div>

      <div className="bg-[rgba(255,236,195,0.8)] pt-[20px] pb-[10px] px-5 backdrop-blur-sm border-solid border-[rgba(255,255,255,0.6)] rounded-md">
        <Form
          name="basic"
          style={{ maxWidth: 600 }}
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
        >
          <div id="amog">
            <span id="amog2">New Game</span>
            <Tooltip title="Once one of them is reached, the game ends">
              <FontAwesomeIcon icon={faCircleInfo} id="info" />
            </Tooltip>
          </div>
          <Form.Item
            name="MaxTime"
            rules={[
              {
                required: true,
                message: "Please enter max time",
              },
            ]}
          >
            <Input placeholder="MaxTime *" />
          </Form.Item>
          <Form.Item
            name="MaxMoney"
            rules={[
              {
                required: true,
                message: "Please enter max money",
              },
            ]}
          >
            <Input placeholder="MaxMoney *" />
          </Form.Item>
          <Form.Item name="submit_button">
            <Button type="primary" htmlType="submit">
              Create
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}

export default CreateGame;
